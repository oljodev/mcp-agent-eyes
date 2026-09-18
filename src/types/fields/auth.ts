/** zod field schemas for the AI-blind login tools. No field accepts a secret. */

import { z } from "zod";

import { CREDENTIAL_SOURCE, LOGIN_FLOW, OTP_SOURCE, VAULT_ACTIONS } from "../auth.js";

export const loginFlowField = z
  .enum(LOGIN_FLOW)
  .default("auto")
  .describe(
    'Form shape. "auto" (default) detects single-step vs identifier-first ' +
      "(email, then password — Google/Microsoft/Okta) and drives both. " +
      "Override only to correct a misdetection.",
  );

export const vaultActionField = z
  .enum(VAULT_ACTIONS)
  .describe(
    '"status" lists profile names and lock state (no secrets). "reset" ' +
      "deletes the vault after the human types RESET — the forgotten-" +
      'passphrase escape hatch. "change_passphrase" re-encrypts every profile.',
  );

export const ssoField = z
  .string()
  .min(1)
  .optional()
  .describe(
    'Provider hint, e.g. "google": click "Continue with Google" and reuse ' +
      "the provider session already in the browser, so no password is typed " +
      "for this site. Logs into the provider once if needed.",
  );

export const assumeConsentField = z
  .boolean()
  .default(false)
  .describe(
    "Skip the per-site consent prompt, for unattended runs. Default false: " +
      "the first sign-in to each new site asks the human to approve it.",
  );

export const authProfileField = z
  .string()
  .min(1)
  .describe(
    'Short name for the account, e.g. "github". Not a secret — it labels ' +
      "the secure prompt and selects a stored credential.",
  );

export const credentialSourceField = z
  .enum(CREDENTIAL_SOURCE)
  .default("prompt")
  .describe(
    '"prompt" (default) asks the human on a localhost page; "vault" pulls ' +
      "them from the encrypted vault for an enrolled profile (unattended). " +
      "The AI never sees the values either way.",
  );

export const otpSourceField = z
  .enum(OTP_SOURCE)
  .default("prompt")
  .describe(
    '"prompt" (default) asks the human; "totp" generates it from the seed ' +
      "in the vault (unattended). The AI never sees the code.",
  );

export const enrollWithTotpField = z
  .boolean()
  .default(false)
  .describe(
    "Also collect the account's TOTP seed, so later 2FA can run unattended " +
      'with submit_2fa_code source="totp".',
  );

export const authLoginUrlField = z
  .string()
  .url()
  .optional()
  .describe(
    "Navigate here first. Omit to act on the open page. Not reloaded if a " +
      "saved session already authenticated you there.",
  );

export const authUsernameSelectorField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Selector for the username/email input. Auto-detected when omitted; the " +
      "result reports which one was used.",
  );

export const authPasswordSelectorField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Selector for the password input. Auto-detected when omitted.",
  );

export const authSubmitSelectorField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Selector for the submit button. Auto-detected when omitted.",
  );

export const authOtpSelectorField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Selector for the one-time-code input. Auto-detected when omitted; pass " +
      "it explicitly if the page state came back unknown.",
  );
