/**
 * Secret-safe page primitives shared by the auth ops. fillSecret() mirrors the
 * interactions.ts typeInto() discipline exactly: it fills via Playwright (which
 * sets the value directly and whose errors name the SELECTOR, never the value)
 * and, on failure, builds a BrowserToolError that interpolates only the
 * selector. The secret string is passed straight into fill() and is never put
 * into a log line, an error message, or a return value.
 */

import type { Page } from "playwright-core";

import { BrowserToolError, formatInteractionError } from "../browser/errors.js";
import { classifyLoginStateInPage } from "../inpage/classify-login.js";
import { detectFieldsInPage } from "../inpage/detect-fields.js";
import type { LoginVerdict, ResolvedSelector } from "../types/auth.js";
import {
  ACTION_TIMEOUT_MS,
  LOGIN_POLL_INTERVAL_MS,
  LOGIN_SETTLE_TIMEOUT_MS,
} from "../types/timeouts.js";

/** Fill a field with a secret value. Only the selector ever appears in errors. */
export async function fillSecret(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  try {
    await page.locator(selector).first().fill(value, { timeout: ACTION_TIMEOUT_MS });
  } catch (error) {
    throw new BrowserToolError(formatInteractionError(error, "type", selector));
  }
}

/** Click a submit/login control. */
export async function clickSubmit(page: Page, selector: string): Promise<void> {
  try {
    await page.locator(selector).first().click({ timeout: ACTION_TIMEOUT_MS });
  } catch (error) {
    throw new BrowserToolError(formatInteractionError(error, "click", selector));
  }
}

/** Does at least one element match this selector right now? (No auto-wait.) */
export async function isPresent(page: Page, selector: string): Promise<boolean> {
  try {
    return (await page.locator(selector).count()) > 0;
  } catch {
    return false;
  }
}

/**
 * Submit the current login stage and report the control used. An explicit
 * submit selector wins when it is present on this page; otherwise we auto-detect
 * a submit/Next button; otherwise we press Enter on the field itself (the
 * keyboard path most identifier-first forms accept). Used for both the single
 * submit and each step of an identifier-first flow.
 */
export async function advanceStage(
  page: Page,
  fieldSelector: string,
  explicitSubmit: string | undefined,
): Promise<ResolvedSelector> {
  if (explicitSubmit && explicitSubmit.trim() && (await isPresent(page, explicitSubmit))) {
    await clickSubmit(page, explicitSubmit);
    return { selector: explicitSubmit, source: "provided" };
  }
  const detected = await page.evaluate(detectFieldsInPage).catch(() => null);
  if (detected?.submit && (await isPresent(page, detected.submit))) {
    await clickSubmit(page, detected.submit);
    return { selector: detected.submit, source: "auto" };
  }
  await page
    .locator(fieldSelector)
    .first()
    .press("Enter", { timeout: ACTION_TIMEOUT_MS })
    .catch(() => undefined);
  return { selector: `(Enter ↵ on ${fieldSelector})`, source: "auto" };
}

/**
 * Poll until a VISIBLE password field appears — the second step of an
 * identifier-first flow, revealed only after the email step is submitted.
 * Returns its unique selector, or null if no password step materialised within
 * the settle window (unknown account, interstitial, or CAPTCHA). Visibility is
 * what matters: providers often keep the password input in the DOM but hidden
 * until the email is accepted, and detectFieldsInPage only returns shown fields.
 */
export async function waitForPasswordField(page: Page): Promise<string | null> {
  const deadline = Date.now() + LOGIN_SETTLE_TIMEOUT_MS;
  for (;;) {
    try {
      const fields = await page.evaluate(detectFieldsInPage);
      if (fields.password) return fields.password;
    } catch {
      // Context torn down by an in-flight redirect — keep waiting for the next page.
    }
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(LOGIN_POLL_INTERVAL_MS);
  }
  return null;
}

/**
 * Re-classify the post-submit page until the verdict is decisive (error, otp,
 * or a clean success) or a short grace period elapses. A single snapshot can
 * fire mid-redirect on a SPA — still on the login URL with the password field
 * present — and misread a real success as "unknown". An evaluate that throws
 * means the execution context was torn down by a navigation in flight, which
 * is itself the success signal we're waiting for, so we swallow it and retry.
 * Shared by authenticate_login and submit_2fa_code (both submit-then-classify).
 */
export async function waitForLoginVerdict(
  page: Page,
  beforeUrl: string,
): Promise<LoginVerdict> {
  const deadline = Date.now() + LOGIN_SETTLE_TIMEOUT_MS;
  let last: LoginVerdict | null = null;
  for (;;) {
    try {
      const verdict = await page.evaluate(classifyLoginStateInPage, {
        loginUrl: beforeUrl,
      });
      last = verdict;
      // "unknown" is the only non-terminal state (may still be redirecting);
      // anything else — error, otp, or success — is a settled answer.
      if (verdict.challenge !== "unknown") return verdict;
    } catch {
      // Context destroyed: a redirect is mid-flight. Keep waiting for it.
    }
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(LOGIN_POLL_INTERVAL_MS);
  }
  return (
    last ?? {
      challenge: "unknown",
      passwordFieldGone: false,
      otpFieldPresent: false,
      urlChanged: false,
    }
  );
}
