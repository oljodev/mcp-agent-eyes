/**
 * Types for the AI-blind login tools (authenticate_login, submit_2fa_code).
 *
 * Note what is ABSENT: no field anywhere holds a username, password, or 2FA
 * code. The AI supplies selectors and a profile label; the server sources the
 * secret values out-of-band and never returns them. A leak would have to add a
 * value-bearing field here first, which review would catch.
 */

import type { PageHealth } from "./health.js";
import type { ViewportName } from "./viewports.js";

/** Outcome of an authenticate_login call. */
export const AUTH_STATUS = [
  "success",
  "otp_required",
  "error",
  "push_wait",
  "unknown",
  "consent_denied",
] as const;
export type AuthStatus = (typeof AUTH_STATUS)[number];

/** Vault management actions exposed by manage_vault. */
export const VAULT_ACTIONS = ["status", "reset", "change_passphrase"] as const;
export type VaultAction = (typeof VAULT_ACTIONS)[number];

/**
 * Login form shape. "single" = username + password on one form. "identifier-
 * first" = email + Next, then password + Next on the next step (Google,
 * Microsoft, Okta…). "auto" (default) detects it from the page: staged when no
 * password field is visible yet.
 */
export const LOGIN_FLOW = ["auto", "single", "identifier-first"] as const;
export type LoginFlow = (typeof LOGIN_FLOW)[number];

/** Where username/password come from: live secure prompt, or the encrypted vault. */
export const CREDENTIAL_SOURCE = ["prompt", "vault"] as const;
export type CredentialSource = (typeof CREDENTIAL_SOURCE)[number];

/** Where a 2FA code comes from: live secure prompt, or a vault-stored TOTP seed. */
export const OTP_SOURCE = ["prompt", "totp"] as const;
export type OtpSource = (typeof OTP_SOURCE)[number];

/** Structured read of the page state after a login/2FA submit. */
export interface LoginVerdict {
  challenge: "none" | "otp" | "error" | "unknown";
  passwordFieldGone: boolean;
  otpFieldPresent: boolean;
  errorText?: string;
  urlChanged: boolean;
}

/** Best-guess selectors discovered in-page when the AI omits them. */
export interface DetectedFields {
  username: string | null;
  password: string | null;
  submit: string | null;
  otp: string | null;
}

export type SelectorSource = "provided" | "auto";

/** A selector actually used, plus whether the AI provided or we detected it. */
export interface ResolvedSelector {
  selector: string;
  source: SelectorSource;
}

export interface AuthLoginInput {
  profile: string;
  source: CredentialSource;
  loginUrl?: string | undefined;
  usernameSelector?: string | undefined;
  passwordSelector?: string | undefined;
  submitSelector?: string | undefined;
  viewport?: ViewportName | undefined;
  /** SSO provider hint (e.g. "google"): click its button + reuse its session. */
  sso?: string | undefined;
  /** Skip the per-site consent prompt (for unattended / CI runs). */
  assumeConsent?: boolean | undefined;
  /** Login form shape: auto-detect (default), single-page, or identifier-first. */
  flow?: LoginFlow | undefined;
}

export interface AuthLoginResult {
  status: AuthStatus;
  verdict: LoginVerdict;
  /** The username/password/submit selectors used (absent for SSO / consent_denied). */
  usedSelectors?: {
    username: ResolvedSelector;
    password: ResolvedSelector;
    submit: ResolvedSelector;
  };
  /** The provider button clicked, when source was an SSO flow. */
  ssoButton?: ResolvedSelector;
  url: string;
  health: PageHealth;
}

export interface Auth2faInput {
  source: OtpSource;
  profile?: string | undefined;
  codeSelector?: string | undefined;
  submitSelector?: string | undefined;
}

export interface Auth2faResult {
  status: "success" | "error" | "unknown";
  verdict: LoginVerdict;
  usedSelectors: { code: ResolvedSelector; submit: ResolvedSelector | null };
  url: string;
  health: PageHealth;
}

/** Stored, configured form selectors for a vault profile (all optional). */
export interface VaultSelectors {
  username?: string;
  password?: string;
  submit?: string;
  otp?: string;
}

/**
 * One encrypted credential record. Lives only inside the AES-256-GCM vault
 * blob and in memory while unlocked — never in a tool argument or result.
 */
export interface VaultProfile {
  loginUrl?: string;
  username: string;
  password: string;
  /** base32 authenticator seed, for unattended TOTP 2FA. */
  totpSecret?: string;
  selectors?: VaultSelectors;
}

export interface EnrollInput {
  profile: string;
  loginUrl?: string | undefined;
  withTotp?: boolean | undefined;
  usernameSelector?: string | undefined;
  passwordSelector?: string | undefined;
  submitSelector?: string | undefined;
  otpSelector?: string | undefined;
}

export interface EnrollResult {
  profile: string;
  hasTotp: boolean;
  hasLoginUrl: boolean;
  storedSelectors: string[];
  /** Total number of profiles in the vault after this enrollment. */
  count: number;
  health: PageHealth;
}

export interface ManageVaultInput {
  action: VaultAction;
}

export interface ManageVaultResult {
  action: VaultAction;
  exists: boolean;
  unlocked: boolean;
  /** Profile names in the vault (never any secret values). */
  profiles: string[];
  summary: string;
  health: PageHealth;
}
