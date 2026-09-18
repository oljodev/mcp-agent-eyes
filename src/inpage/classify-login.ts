import type { LoginVerdict } from "../types/auth.js";

/**
 * Runs inside the page (must be self-contained — no outer-scope captures).
 * After a login/2FA submit, read the page state into a structured verdict so
 * the op can decide whether we succeeded, hit a 2FA challenge, or were
 * rejected — WITHOUT returning a screenshot (a 2FA code renders as visible
 * plaintext, so auth tools never image this page). The only param is the
 * pre-submit URL; the LoginVerdict import is type-only and erased at compile.
 */
export function classifyLoginStateInPage(arg: { loginUrl: string }): LoginVerdict {
  function isShown(el: Element): boolean {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function normalize(href: string): string {
    try {
      const u = new URL(href);
      return (u.origin + u.pathname).replace(/\/+$/, "");
    } catch {
      return href.replace(/[#?].*$/, "").replace(/\/+$/, "");
    }
  }

  const urlChanged = normalize(location.href) !== normalize(arg.loginUrl);

  const passwordFields = Array.from(
    document.querySelectorAll('input[type="password"]'),
  ).filter(isShown);
  const passwordFieldGone = passwordFields.length === 0;

  const OTP_SELECTOR =
    'input[autocomplete="one-time-code"], input[name*="otp" i], ' +
    'input[name*="code" i], input[name*="token" i], input[id*="otp" i], ' +
    'input[aria-label*="code" i], input[inputmode="numeric"][maxlength]';
  const otpFieldPresent = Array.from(
    document.querySelectorAll(OTP_SELECTOR),
  ).some(isShown);

  const ERROR_SELECTOR =
    '[role="alert"], [aria-live="assertive"], .error, .alert-danger, ' +
    '[class*="error" i]';
  let errorText: string | undefined;
  for (const el of Array.from(document.querySelectorAll(ERROR_SELECTOR))) {
    if (!isShown(el)) {
      continue;
    }
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text) {
      errorText = text.slice(0, 200);
      break;
    }
  }

  // Order matters: a still-visible password field + an error message is the
  // classic "submit rejected" state and wins over a stray otp-looking input.
  let challenge: LoginVerdict["challenge"];
  if (errorText && !passwordFieldGone) {
    challenge = "error";
  } else if (otpFieldPresent) {
    challenge = "otp";
  } else if (passwordFieldGone && urlChanged) {
    challenge = "none";
  } else {
    challenge = "unknown";
  }

  const verdict: LoginVerdict = {
    challenge,
    passwordFieldGone,
    otpFieldPresent,
    urlChanged,
  };
  if (errorText !== undefined) {
    verdict.errorText = errorText;
  }
  return verdict;
}
