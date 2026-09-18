/** zod field schemas for the AI-blind login tools. No field accepts a secret. */

import { z } from "zod";

import { CREDENTIAL_SOURCE, LOGIN_FLOW, OTP_SOURCE, VAULT_ACTIONS } from "../auth.js";

export const loginFlowField = z
  .enum(LOGIN_FLOW)
  .default("auto")
  .describe(
    'Login form shape. "auto" (default) detects it: a single username+password ' +
      "form is filled in one step, while an identifier-first page (email + Next, " +
      'THEN password + Next — Google, Microsoft, Okta) is driven across both ' +
      'steps automatically. Set "single" or "identifier-first" only to override ' +
      "detection. Either way the AI never sees the values and no extra human " +
      "prompt is needed (username + password are collected up front).",
  );

export const vaultActionField = z
  .enum(VAULT_ACTIONS)
  .describe(
    'Vault management action. "status" reports whether a vault exists / is ' +
      'unlocked and lists profile names (no secrets). "reset" permanently ' +
      "deletes the vault file after the human types RESET in the secure " +
      "prompt — the escape hatch for a forgotten passphrase. " +
      '"change_passphrase" unlocks with the old passphrase (if locked) then ' +
      "re-encrypts every profile under a new one entered twice.",
  );

export const ssoField = z
  .string()
  .min(1)
  .optional()
  .describe(
    'SSO provider hint, e.g. "google". When set, authenticate_login clicks ' +
      'the matching provider button ("Continue with Google") and reuses the ' +
      "provider session already in the browser — no password is typed for the " +
      "destination site. If no provider session exists yet, it logs into the " +
      "provider once (secure prompt, or a vault profile named after the " +
      "provider) and retries. Enroll the provider ONCE, then reuse it everywhere.",
  );

export const assumeConsentField = z
  .boolean()
  .default(false)
  .describe(
    "Skip the per-site Continue/Cancel consent prompt for this call (for " +
      "unattended / CI runs). Default false: the first sign-in to each new " +
      "site this session asks the human to approve it.",
  );

export const authProfileField = z
  .string()
  .min(1)
  .describe(
    "A short name for the account/site you are logging into, e.g. \"github\" " +
      'or "staging-admin". This is NOT a secret — it only labels the secure ' +
      "prompt the human sees (and, in future, selects a stored credential).",
  );

export const credentialSourceField = z
  .enum(CREDENTIAL_SOURCE)
  .default("prompt")
  .describe(
    'Where the username and password come from. "prompt" (default) opens a ' +
      "localhost secure page where the human types them in. \"vault\" pulls " +
      "them from the encrypted credential vault for a profile enrolled with " +
      "enroll_credentials (unattended; the human is asked once for the vault " +
      "passphrase if it is locked). Either way the AI never sees the values.",
  );

export const otpSourceField = z
  .enum(OTP_SOURCE)
  .default("prompt")
  .describe(
    'Where the 2FA code comes from. "prompt" (default) opens a localhost ' +
      'secure page where the human types the current code. "totp" generates ' +
      "it from the TOTP seed stored in the vault for this profile (fully " +
      "unattended). The AI never sees the code either way.",
  );

export const enrollWithTotpField = z
  .boolean()
  .default(false)
  .describe(
    "When true, enroll_credentials also asks the human (in the secure prompt) " +
      "for the account's TOTP setup key / seed, so future 2FA can be solved " +
      'unattended with submit_2fa_code source="totp".',
  );

export const authLoginUrlField = z
  .string()
  .url()
  .optional()
  .describe(
    "Optional: navigate to this login URL first. Omit to act on the page " +
      "already open. If a saved session already authenticated you on this " +
      "URL it is NOT reloaded, so existing state is preserved.",
  );

export const authUsernameSelectorField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "CSS (or Playwright text=/role=) selector for the username/email input. " +
      "Optional — auto-detected from the form when omitted. The tool reports " +
      "which selector it actually used so you can correct it on a retry.",
  );

export const authPasswordSelectorField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Selector for the password input. Optional — auto-detected " +
      "(input[type=password]) when omitted.",
  );

export const authSubmitSelectorField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Selector for the submit/login button. Optional — auto-detected within " +
      "the password field's form when omitted.",
  );

export const authOtpSelectorField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Selector for the one-time-code input. Optional — auto-detected " +
      "(input[autocomplete=one-time-code] and common patterns) when omitted. " +
      "If the page state was classified as unknown, pass this explicitly.",
  );
