/**
 * SecretRegistry — the central leak guard for the AI-blind auth subsystem.
 *
 * A secret value (a typed password, a 2FA code) lives only inside one op's
 * local scope for the duration of a single fill(). But page scripts often echo
 * form values to the console, and that telemetry is drained into every tool
 * response. So the instant a secret exists we `arm()` it here; while armed, any
 * outbound string can be `scrub()`-ed and the drained PageHealth passed through
 * `scrubHealth()` so the value can never ride out in telemetry or an error.
 *
 * Honesty note: V8 strings are immutable and GC-controlled, so this cannot
 * guarantee erasure of the secret from memory — it is a redaction filter on
 * the response surface, not a secure-memory primitive.
 */

import type { PageHealth } from "../types/health.js";

const PLACEHOLDER = "‹redacted›";
/** Keep a disarmed secret scrubbable briefly, to catch a delayed echo. */
const LINGER_MS = 2_000;

class SecretRegistry {
  /** Live secret variants → reference count. */
  private readonly live = new Map<string, number>();

  /**
   * Register a secret as live. Returns a disarm() that drops it after a short
   * linger. No-op (and a no-op disarm) for empty/whitespace, which must never
   * be armed — they would redact everything.
   */
  arm(secret: string): () => void {
    if (!secret || !secret.trim()) {
      return () => undefined;
    }
    const variants = this.variantsOf(secret);
    for (const v of variants) {
      this.live.set(v, (this.live.get(v) ?? 0) + 1);
    }
    let disarmed = false;
    return () => {
      if (disarmed) {
        return;
      }
      disarmed = true;
      const timer = setTimeout(() => {
        for (const v of variants) {
          const n = (this.live.get(v) ?? 0) - 1;
          if (n <= 0) {
            this.live.delete(v);
          } else {
            this.live.set(v, n);
          }
        }
      }, LINGER_MS);
      (timer as { unref?: () => void }).unref?.();
    };
  }

  private variantsOf(secret: string): string[] {
    const set = new Set<string>([secret, secret.trim()]);
    try {
      set.add(encodeURIComponent(secret));
    } catch {
      // Lone surrogates etc. — the raw form still covers the common case.
    }
    return [...set].filter((s) => s.length > 0);
  }

  /** Replace every live secret with the placeholder (longest match first). */
  scrub(text: string): string {
    if (!text || this.live.size === 0) {
      return text;
    }
    let out = text;
    const keys = [...this.live.keys()].sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (out.includes(key)) {
        out = out.split(key).join(PLACEHOLDER);
      }
    }
    return out;
  }

  /** Scrub every string field of a drained PageHealth. */
  scrubHealth(health: PageHealth): PageHealth {
    if (this.live.size === 0) {
      return health;
    }
    const list = (arr: string[]): string[] => arr.map((e) => this.scrub(e));
    return {
      ...health,
      consoleErrors: list(health.consoleErrors),
      pageErrors: list(health.pageErrors),
      failedRequests: list(health.failedRequests),
      httpErrors: list(health.httpErrors),
      blankPage: health.blankPage
        ? { ...health.blankPage, detail: this.scrub(health.blankPage.detail) }
        : health.blankPage,
    };
  }
}

/** Process-wide registry of currently-live secrets. */
export const secrets = new SecretRegistry();

/** Scrub any armed secret from an arbitrary string (no-op when none armed). */
export function redact(text: string): string {
  return secrets.scrub(text);
}
