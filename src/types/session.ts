/**
 * Auth/session state: cookies, localStorage seeds, headers, and the
 * manage_session input shape.
 */

/** Directory (relative to cwd) where storageState snapshots are saved. */
export const SESSIONS_DIR = ".agent-eyes/sessions";

export const SESSION_ACTIONS = ["set", "clear", "save", "load"] as const;
export type SessionAction = (typeof SESSION_ACTIONS)[number];

/** A cookie in Playwright addCookies() shape (needs url, OR domain+path). */
export interface SessionCookie {
  name: string;
  value: string;
  url?: string | undefined;
  domain?: string | undefined;
  path?: string | undefined;
  expires?: number | undefined;
  httpOnly?: boolean | undefined;
  secure?: boolean | undefined;
  sameSite?: "Strict" | "Lax" | "None" | undefined;
}

/** localStorage entries to seed for one origin. */
export interface LocalStorageSeed {
  origin: string;
  items: Array<{ name: string; value: string }>;
}

/** Arguments accepted by manage_session. */
export interface ManageSessionInput {
  action: SessionAction;
  cookies?: SessionCookie[] | undefined;
  localStorage?: LocalStorageSeed[] | undefined;
  headers?: Record<string, string> | undefined;
  name?: string | undefined;
}
