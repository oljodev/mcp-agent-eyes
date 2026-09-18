/**
 * Agent-facing errors and the formatters that turn raw Playwright failures into
 * messages written for the AI agent on the other end of the MCP connection.
 */

import { errors as playwrightErrors } from "playwright-core";

import { ACTION_TIMEOUT_MS, NAVIGATION_TIMEOUT_MS } from "../types/timeouts.js";

/**
 * An error whose message is written for the AI agent on the other end of the
 * MCP connection: it explains what went wrong and what to try next, instead
 * of leaking a raw Playwright stack trace.
 */
export class BrowserToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserToolError";
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? "")
    : String(error);
}

export function formatLaunchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Executable doesn't exist")) {
    return (
      "Chromium is not installed for Playwright. Run " +
      '"npx playwright@1.60 install chromium" (or "npm run install-browsers" ' +
      "from the package directory) and try again."
    );
  }
  if (
    message.includes("missing dependencies") ||
    message.includes("Host system")
  ) {
    return (
      "Chromium is installed but system libraries are missing. Run " +
      '"npx playwright@1.60 install-deps chromium" (requires sudo) and try again.'
    );
  }
  return `Failed to launch the headless browser: ${messageOf(error)}`;
}

export function formatCdpError(error: unknown, cdpUrl: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /ECONNREFUSED|ECONNRESET|connect|WebSocket|refused|socket hang up|timed? ?out/i.test(
      message,
    )
  ) {
    return (
      `Could not attach to Chrome over CDP at ${cdpUrl}. Start a real Chrome ` +
      "with a remote-debugging port FIRST (launched by you, not by agent-eyes, " +
      "so it has a clean, non-automated fingerprint), e.g.:\n" +
      '  google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.agent-eyes-chrome"\n' +
      `then keep AGENT_EYES_CDP_URL=${cdpUrl}. (${messageOf(error)})`
    );
  }
  return `Failed to attach to Chrome over CDP at ${cdpUrl}: ${messageOf(error)}`;
}

export function formatNavigationError(error: unknown, url: string): string {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("net::ERR_CONNECTION_REFUSED") ||
    message.includes("ECONNREFUSED")
  ) {
    return (
      `Nothing is listening at ${url} — the connection was refused. ` +
      "If this is a local dev server, make sure it is running and that the " +
      "port is correct."
    );
  }
  if (message.includes("net::ERR_NAME_NOT_RESOLVED")) {
    return `The hostname in ${url} could not be resolved. Check the URL for typos.`;
  }
  if (error instanceof playwrightErrors.TimeoutError) {
    return (
      `Navigation to ${url} timed out after ${NAVIGATION_TIMEOUT_MS / 1000}s. ` +
      "The server may be very slow or hanging. If the load had partially " +
      "committed, the session was reset to a blank page; retry when the " +
      "server is responsive."
    );
  }
  return `Failed to load ${url}: ${messageOf(error)}`;
}

export function formatInteractionError(
  error: unknown,
  action: string,
  selector: string,
): string {
  if (error instanceof playwrightErrors.TimeoutError) {
    return (
      `Interaction failed: no element matching selector "${selector}" was ` +
      `visible and actionable within ${ACTION_TIMEOUT_MS / 1000}s for ` +
      `${action}. Verify the selector against the most recent screenshot — ` +
      "the element may be hidden, covered by an overlay, or absent at this " +
      "viewport size."
    );
  }
  return `Interaction failed: could not ${action} "${selector}": ${messageOf(error)}`;
}

export function normalizeUrl(rawUrl: string): string {
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawUrl)
    ? rawUrl
    : `http://${rawUrl}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new BrowserToolError(
      `"${rawUrl}" is not a valid URL. Pass an absolute URL such as ` +
        "http://localhost:5173 or https://example.com.",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BrowserToolError(
      `Unsupported URL scheme "${parsed.protocol}" — only http(s) URLs can be inspected.`,
    );
  }
  return parsed.href;
}

export function trimUrl(url: string): string {
  return url.length > 120 ? `${url.slice(0, 117)}...` : url;
}
