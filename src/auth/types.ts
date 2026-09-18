/**
 * Shared shapes internal to the AI-blind auth subsystem (src/auth/*). These
 * describe the OUT-OF-BAND secret channel, never anything the AI sees.
 */

/**
 * What kind of screen the secure prompt shows. Most ask for a secret;
 * "consent" is a Continue/Cancel decision (no secret), and "reset_confirm"
 * makes the human type RESET to wipe the vault.
 */
export type PromptKind =
  | "username"
  | "password"
  | "otp"
  | "passphrase"
  | "secret"
  | "consent"
  | "reset_confirm"
  | "handoff";

/** One pending request for an out-of-band secret (or decision). */
export interface PromptRequest {
  kind: PromptKind;
  /** Which account/site this is for — shown to the human, never a secret. */
  profile?: string;
  /** Optional human-facing label override for the announce line. */
  label?: string;
  /**
   * passphrase only: when true, render a CREATE screen (two fields that must
   * match + a minimum length) instead of the single-field UNLOCK screen.
   */
  confirm?: boolean;
  /** Minimum length enforced when confirm is set (default 8). */
  minLength?: number;
  /** handoff only: the plain-language instruction shown to the human. */
  message?: string;
  /** Override the default time-to-live (ms) the human has to respond. */
  ttlMs?: number;
  /** Abort the pending prompt early (e.g. another race winner resolved first). */
  signal?: AbortSignal;
}

/** Info passed to an embedder's announce hook so it can render the prompt. */
export interface PromptAnnouncement {
  url: string;
  kind: PromptKind;
  profile?: string;
  label: string;
}
