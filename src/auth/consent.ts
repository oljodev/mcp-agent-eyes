/**
 * Per-session, per-origin sign-in consent. The right unit of control is the
 * DESTINATION (where Claude is signing in), not the password — so before
 * authenticate_login fills credentials or reuses a session for a site, the
 * human approves that site once via the secure prompt's Continue/Cancel screen.
 * Grants are cached in memory for the life of the server process (never on
 * disk), so the same site isn't re-asked every call within one session.
 */

import { securePrompt } from "./secure-prompt.js";

class ConsentStore {
  private readonly granted = new Set<string>();

  has(origin: string): boolean {
    return this.granted.has(origin);
  }

  grant(origin: string): void {
    this.granted.add(origin);
  }

  clear(): void {
    this.granted.clear();
  }
}

/** Process-wide consent cache. */
export const consent = new ConsentStore();

/**
 * Ensure the human has approved signing in to `originKey` this session.
 * Returns true if already granted, pre-authorized (assume), or the human
 * clicks Continue; false if they click Cancel. `display` is shown on the
 * consent screen (the site host); `originKey` is the cache key (the origin).
 */
export async function ensureConsent(
  originKey: string,
  display: string,
  assume: boolean,
): Promise<boolean> {
  if (assume || consent.has(originKey)) {
    consent.grant(originKey);
    return true;
  }
  const decision = await securePrompt.request({ kind: "consent", profile: display });
  if (decision === "continue") {
    consent.grant(originKey);
    return true;
  }
  return false;
}
