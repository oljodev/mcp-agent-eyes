/** Node-side reachability probe run before navigating the persistent page. */

import { PREFLIGHT_TIMEOUT_MS } from "../types/timeouts.js";
import { BrowserToolError } from "./errors.js";

/**
 * Cheap Node-side reachability probe. Throws a friendly error for the two
 * unambiguous failures (connection refused, unknown host); every other
 * outcome — TLS errors from self-signed dev certs, servers that reject
 * HEAD, slow responses — is inconclusive and falls through to the real
 * browser navigation.
 *
 * localhost needs special care: Node's fetch may try only ::1 while the dev
 * server listens only on 127.0.0.1 (or vice versa) — Chromium tries both.
 * A refused localhost probe therefore retries both literal addresses before
 * concluding that nothing is listening.
 */
export async function preflight(url: string): Promise<void> {
  const probe = (target: string) =>
    fetch(target, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    });

  let code: string | undefined;
  try {
    await probe(url);
    return;
  } catch (error) {
    code = networkErrorCode(error);
  }

  if (code === "ECONNREFUSED") {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost") {
      for (const literal of ["127.0.0.1", "[::1]"]) {
        const alt = new URL(url);
        alt.hostname = literal;
        try {
          await probe(alt.href);
          return; // one family answers — Chromium will find it too
        } catch (error) {
          if (networkErrorCode(error) !== "ECONNREFUSED") {
            return; // not refused (e.g. TLS complaint) — server exists
          }
        }
      }
    }
    throw new BrowserToolError(
      `Nothing is listening at ${url} — the connection was refused. ` +
        "If this is a local dev server, make sure it is running and that " +
        "the port is correct.",
    );
  }

  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    throw new BrowserToolError(
      `The hostname in ${url} could not be resolved. Check the URL for typos.`,
    );
  }
  // Anything else is inconclusive — let Chromium try for real.
}

/** Dig the syscall error code out of a fetch failure, if there is one. */
export function networkErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const cause = error.cause;
  if (cause instanceof AggregateError) {
    // Dual-stack hosts surface one error per address family.
    const codes = cause.errors.map((e) => (e as { code?: string }).code);
    return (
      (cause as { code?: string }).code ??
      codes.find((c): c is string => typeof c === "string")
    );
  }
  if (cause && typeof cause === "object" && "code" in cause) {
    return typeof cause.code === "string" ? cause.code : undefined;
  }
  return undefined;
}
