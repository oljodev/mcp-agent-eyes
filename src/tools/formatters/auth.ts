/** Status-line formatting for authenticate_login and submit_2fa_code. */

import { redact } from "../../auth/redact.js";
import type {
  Auth2faResult,
  AuthLoginResult,
  ManageVaultResult,
  ResolvedSelector,
} from "../../types/auth.js";

export function formatVaultStatus(result: ManageVaultResult): string {
  const state = result.exists
    ? result.unlocked
      ? "exists, unlocked"
      : "exists, locked"
    : "not created";
  return [
    `VAULT ${result.action.toUpperCase()} — vault ${state}.`,
    result.summary,
  ].join("\n");
}

function selectorList(
  used: Record<string, ResolvedSelector | null>,
): string {
  return Object.entries(used)
    .map(([field, sel]) =>
      sel ? `${field}=${sel.selector} (${sel.source})` : `${field}=(auto Enter)`,
    )
    .join(", ");
}

const LOGIN_HEAD: Record<AuthLoginResult["status"], string> = {
  success: "LOGIN SUCCEEDED",
  otp_required: "OTP REQUIRED",
  error: "LOGIN FAILED",
  push_wait: "PASSWORD ACCEPTED — AWAITING APPROVAL",
  unknown: "RESULT UNCLEAR",
  consent_denied: "CONSENT DENIED",
};

const LOGIN_NEXT: Record<AuthLoginResult["status"], string> = {
  success:
    "Next: call manage_session action=save name=<x> to persist these cookies, " +
    "then capture_page_screenshot to view the authenticated page.",
  otp_required:
    "Next: call submit_2fa_code — the human will type the current code into " +
    "the secure prompt.",
  error:
    "Next: the credentials were rejected or the form errored. Re-check the " +
    "selectors against a fresh capture_page_screenshot, then retry.",
  push_wait:
    "Next: the site is likely waiting on a phone/app approval. Poll with " +
    "capture_page_screenshot until the page advances, then manage_session save.",
  unknown:
    "Next: the page state could not be classified. Take a " +
    "capture_page_screenshot to see it, then retry passing explicit selectors.",
  consent_denied:
    "Next: the human declined sign-in to this site in the consent prompt. " +
    "Nothing was filled. Do not retry unless they ask you to.",
};

export function formatLoginStatus(result: AuthLoginResult): string {
  const lines = [`${LOGIN_HEAD[result.status]} — now at ${result.url}`];
  if (result.verdict.errorText) {
    lines.push(`Page error text: "${result.verdict.errorText}"`);
  }
  if (result.ssoButton) {
    lines.push(`SSO: clicked ${result.ssoButton.selector} (${result.ssoButton.source})`);
  }
  if (result.usedSelectors) {
    lines.push(`Selectors used: ${selectorList(result.usedSelectors)}`);
  }
  lines.push(LOGIN_NEXT[result.status]);
  // Defence in depth: a secret can never reach here, but scrub anyway.
  return redact(lines.join("\n"));
}

const TWOFA_HEAD: Record<Auth2faResult["status"], string> = {
  success: "2FA ACCEPTED — LOGIN COMPLETE",
  error: "2FA REJECTED",
  unknown: "2FA RESULT UNCLEAR",
};

const TWOFA_NEXT: Record<Auth2faResult["status"], string> = {
  success:
    "Next: call manage_session action=save name=<x> to persist cookies for reuse.",
  error:
    "Next: the code was wrong or expired. Re-run submit_2fa_code for a fresh one.",
  unknown:
    "Next: state unclear — capture_page_screenshot to inspect, then retry with " +
    "an explicit codeSelector if needed.",
};

export function format2faStatus(result: Auth2faResult): string {
  const lines = [`${TWOFA_HEAD[result.status]} — now at ${result.url}`];
  if (result.verdict.errorText) {
    lines.push(`Page error text: "${result.verdict.errorText}"`);
  }
  lines.push(`Selectors used: ${selectorList(result.usedSelectors)}`);
  lines.push(TWOFA_NEXT[result.status]);
  return redact(lines.join("\n"));
}
