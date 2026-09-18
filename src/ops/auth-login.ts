/**
 * authenticate_login — sign the user in without the AI ever seeing the
 * credentials. Three flows behind one tool:
 *   • password: fill username + password (from the secure prompt or the vault).
 *   • sso: click a provider button ("Continue with Google") and reuse the
 *     provider session already in the browser context; if there is none, log
 *     into the provider once (secure prompt / vault) and retry.
 * Every flow is gated by a per-site consent screen first (cached per session).
 * Returns a text status only; NEVER an image (a rejected/2FA page can show
 * secret values).
 */

import type { Page } from "playwright-core";

import { ensureConsent } from "../auth/consent.js";
import { securePrompt } from "../auth/secure-prompt.js";
import { secrets } from "../auth/redact.js";
import { vault } from "../auth/vault.js";
import { BrowserToolError } from "../browser/errors.js";
import { applyViewport, navigateIfNeeded, settle } from "../browser/navigation.js";
import type { BrowserSession } from "../browser/session.js";
import { classifyLoginStateInPage } from "../inpage/classify-login.js";
import { detectFieldsInPage } from "../inpage/detect-fields.js";
import type {
  AuthLoginInput,
  AuthLoginResult,
  AuthStatus,
  DetectedFields,
  LoginVerdict,
  ResolvedSelector,
  VaultProfile,
  VaultSelectors,
} from "../types/auth.js";
import { ACTION_TIMEOUT_MS, REFLOW_PAUSE_MS } from "../types/timeouts.js";
import {
  advanceStage,
  clickSubmit,
  fillSecret,
  waitForLoginVerdict,
  waitForPasswordField,
} from "./auth-fill.js";

const EMPTY_FIELDS: DetectedFields = {
  username: null,
  password: null,
  submit: null,
  otp: null,
};

const NEUTRAL_VERDICT: LoginVerdict = {
  challenge: "unknown",
  passwordFieldGone: false,
  otpFieldPresent: false,
  urlChanged: false,
};

export function authenticateLogin(
  session: BrowserSession,
  input: AuthLoginInput,
): Promise<AuthLoginResult> {
  return session.core.runExclusive(async () => {
    const profileData =
      input.source === "vault" ? await unlockAndGet(input.profile) : null;

    const loginUrl = input.loginUrl ?? profileData?.loginUrl;
    const target = input.viewport ?? session.core.currentViewport ?? "desktop";
    const page = loginUrl
      ? await session.core.ensurePage(target)
      : session.core.activePage();
    if (loginUrl) {
      await navigateIfNeeded(session.core, page, loginUrl, { forceReload: false });
    } else if (input.viewport) {
      await applyViewport(session.core, page, input.viewport);
    }

    // Per-site consent gate (cached per session). Asked before we fill any
    // credential OR reuse a session for the destination.
    const dest = destinationOf(page.url());
    const allowed = await ensureConsent(
      dest.origin,
      dest.display,
      input.assumeConsent ?? false,
    );
    if (!allowed) {
      return {
        status: "consent_denied",
        verdict: NEUTRAL_VERDICT,
        url: page.url(),
        health: await session.core.drainHealth(),
      };
    }

    if (input.sso) {
      return ssoLogin(session, page, input, dest.origin);
    }
    return passwordLogin(session, page, input, profileData);
  });
}

// --- password flow ----------------------------------------------------------

async function passwordLogin(
  session: BrowserSession,
  page: Page,
  input: AuthLoginInput,
  profileData: VaultProfile | null,
): Promise<AuthLoginResult> {
  const stored = profileData?.selectors;
  const detected = await detectIfNeeded(page, input, stored);
  const username = resolveSelector("username", input.usernameSelector, stored?.username, detected.username);

  // Collect BOTH credentials up front — even for identifier-first flows — so the
  // staged email→password sequence needs no extra human round-trip.
  const userValue = profileData
    ? profileData.username
    : await securePrompt.request({ kind: "username", profile: input.profile });
  const passValue = profileData
    ? profileData.password
    : await securePrompt.request({ kind: "password", profile: input.profile });
  const disarm = [secrets.arm(userValue), secrets.arm(passValue)];
  try {
    if (await isStaged(page, input, stored, detected)) {
      return await stagedLogin(session, page, input, username, userValue, passValue);
    }
    const password = resolveSelector("password", input.passwordSelector, stored?.password, detected.password);
    const submit = resolveSelector("submit", input.submitSelector, stored?.submit, detected.submit);
    const beforeUrl = page.url();
    await fillSecret(page, username.selector, userValue);
    await fillSecret(page, password.selector, passValue);
    await clickSubmit(page, submit.selector);
    await page.waitForTimeout(REFLOW_PAUSE_MS);
    await settle(page);

    const verdict = await waitForLoginVerdict(page, beforeUrl);
    const health = secrets.scrubHealth(await session.core.drainHealth());
    return {
      status: deriveStatus(verdict),
      verdict,
      usedSelectors: { username, password, submit },
      url: page.url(),
      health,
    };
  } finally {
    for (const d of disarm) d();
  }
}

/** Sentinel reported for the password slot when the staged flow stopped early. */
const PASSWORD_NOT_REACHED: ResolvedSelector = {
  selector: "(password step not reached)",
  source: "auto",
};

/**
 * Decide single-page vs identifier-first. The caller's explicit `flow` wins;
 * "auto" stages whenever no password field is VISIBLE on the current page (a
 * hidden-in-DOM password input still counts as the second step).
 */
async function isStaged(
  page: Page,
  input: AuthLoginInput,
  stored: VaultSelectors | undefined,
  detected: DetectedFields,
): Promise<boolean> {
  const flow = input.flow ?? "auto";
  if (flow === "single") return false;
  if (flow === "identifier-first") return true;
  if (detected.password) return false;
  const explicit =
    (input.passwordSelector && input.passwordSelector.trim()) ||
    (stored?.password && stored.password.trim());
  if (explicit && (await isVisible(page, explicit))) return false;
  return true;
}

/**
 * Identifier-first: fill the email, click Next, wait for the password step to
 * appear, fill it, click Next, then classify. If the password step never shows
 * (and the page isn't already an error/OTP), fail clearly rather than hang.
 */
async function stagedLogin(
  session: BrowserSession,
  page: Page,
  input: AuthLoginInput,
  username: ResolvedSelector,
  userValue: string,
  passValue: string,
): Promise<AuthLoginResult> {
  const beforeUrl = page.url();

  // Stage 1 — identifier.
  await fillSecret(page, username.selector, userValue);
  await advanceStage(page, username.selector, input.submitSelector);

  const passwordSelector = await waitForPasswordField(page);
  if (!passwordSelector) {
    // No password step appeared. A single snapshot now is decisive (we already
    // waited the full settle window above). If the page is showing an error
    // (e.g. "Couldn't find your account") or an OTP, surface that; otherwise
    // fail clearly rather than hang.
    const verdict = await page
      .evaluate(classifyLoginStateInPage, { loginUrl: beforeUrl })
      .catch(() => NEUTRAL_VERDICT);
    if (verdict.challenge === "error" || verdict.otpFieldPresent || verdict.errorText) {
      const health = secrets.scrubHealth(await session.core.drainHealth());
      return {
        status: verdict.errorText ? "error" : deriveStatus(verdict),
        verdict,
        usedSelectors: { username, password: PASSWORD_NOT_REACHED, submit: PASSWORD_NOT_REACHED },
        url: page.url(),
        health,
      };
    }
    throw new BrowserToolError(
      "Identifier-first flow: the password step did not appear after submitting " +
        "the username. The account may be unknown, or the site showed an " +
        "interstitial/CAPTCHA. Verify the username, or pass passwordSelector " +
        "once the password field is visible (capture_page_screenshot to see it).",
    );
  }

  // Stage 2 — password.
  const password: ResolvedSelector = { selector: passwordSelector, source: "auto" };
  await fillSecret(page, passwordSelector, passValue);
  const submit = await advanceStage(page, passwordSelector, input.submitSelector);
  await page.waitForTimeout(REFLOW_PAUSE_MS);
  await settle(page);

  const verdict = await waitForLoginVerdict(page, beforeUrl);
  const health = secrets.scrubHealth(await session.core.drainHealth());
  return {
    status: deriveStatus(verdict),
    verdict,
    usedSelectors: { username, password, submit },
    url: page.url(),
    health,
  };
}

/** Is this selector matched by a VISIBLE element right now? (No auto-wait.) */
async function isVisible(page: Page, selector: string): Promise<boolean> {
  try {
    return await page.locator(selector).first().isVisible();
  } catch {
    return false;
  }
}

// --- SSO flow ---------------------------------------------------------------

async function ssoLogin(
  session: BrowserSession,
  page: Page,
  input: AuthLoginInput,
  destOrigin: string,
): Promise<AuthLoginResult> {
  const provider = input.sso!;
  const beforeUrl = page.url();
  const ssoButton = await clickProviderButton(page, provider, input.submitSelector);
  await page.waitForTimeout(REFLOW_PAUSE_MS);
  await settle(page);
  let verdict = await waitForLoginVerdict(page, beforeUrl);

  // Parked on the provider's own origin (not redirected back) means no provider
  // session exists yet — the provider is showing its login form (which may be a
  // single page OR identifier-first: email only, no password field yet). Log
  // into it once; the provider then redirects back to the destination,
  // authenticated. An origin check (not "is a password visible") is what
  // distinguishes this, since identifier-first providers show no password first.
  if (safeOrigin(page.url()) !== destOrigin) {
    await providerLogin(session, page, provider);
    verdict = await waitForLoginVerdict(page, beforeUrl);
  }

  const health = secrets.scrubHealth(await session.core.drainHealth());
  return {
    status: deriveSsoStatus(verdict, destOrigin, page.url()),
    verdict,
    ssoButton,
    url: page.url(),
    health,
  };
}

/** Click the provider's SSO button (explicit selector wins; else match text). */
async function clickProviderButton(
  page: Page,
  provider: string,
  explicit: string | undefined,
): Promise<ResolvedSelector> {
  if (explicit && explicit.trim()) {
    await clickSubmit(page, explicit);
    return { selector: explicit, source: "provided" };
  }
  const pattern = new RegExp(
    `(continue|sign\\s?in|log\\s?in|connect)\\s*(with|using)?\\s*${escapeRegExp(provider)}`,
    "i",
  );
  const locator = page
    .locator('button, a, [role="button"], [role="link"], input[type="submit"]')
    .filter({ hasText: pattern })
    .first();
  if ((await locator.count()) === 0) {
    throw new BrowserToolError(
      `Could not find a "${provider}" sign-in button on the page (looked for ` +
        `text like "Continue with ${provider}"). Pass submitSelector with the ` +
        "button's selector.",
    );
  }
  await locator.click({ timeout: ACTION_TIMEOUT_MS });
  return { selector: `(${provider} SSO button)`, source: "auto" };
}

/** Log into the SSO provider once (vault profile named after it, or prompt). */
async function providerLogin(
  session: BrowserSession,
  page: Page,
  provider: string,
): Promise<void> {
  let user: string;
  let pass: string;
  if (vault.isUnlocked() && vault.hasProfile(provider)) {
    const p = vault.get(provider);
    user = p.username;
    pass = p.password;
  } else {
    user = await securePrompt.request({ kind: "username", profile: provider });
    pass = await securePrompt.request({ kind: "password", profile: provider });
  }
  const fields = await page.evaluate(detectFieldsInPage).catch(() => null);
  if (!fields?.username) {
    throw new BrowserToolError(
      `Landed on the ${provider} sign-in page but could not auto-detect its ` +
        "username/email field. Pass submitSelector to drive it manually, or " +
        "enroll a vault profile named after the provider with explicit selectors.",
    );
  }
  const disarm = [secrets.arm(user), secrets.arm(pass)];
  try {
    if (fields.password) {
      // Single-page provider form: username + password together.
      await fillSecret(page, fields.username, user);
      await fillSecret(page, fields.password, pass);
      await advanceStage(page, fields.password, fields.submit ?? undefined);
    } else {
      // Identifier-first provider (e.g. real Google): email → Next → password → Next.
      await fillSecret(page, fields.username, user);
      await advanceStage(page, fields.username, undefined);
      const passwordSelector = await waitForPasswordField(page);
      if (!passwordSelector) {
        throw new BrowserToolError(
          `The ${provider} sign-in did not show a password step after the email ` +
            "(the account may be unknown to the provider, or it showed a CAPTCHA/" +
            "interstitial that automation can't pass).",
        );
      }
      await fillSecret(page, passwordSelector, pass);
      await advanceStage(page, passwordSelector, undefined);
    }
    await page.waitForTimeout(REFLOW_PAUSE_MS);
    await settle(page);
  } finally {
    for (const d of disarm) d();
  }
}

// --- shared helpers ---------------------------------------------------------

/** Unlock the vault (prompting for the passphrase if needed) and read a profile. */
async function unlockAndGet(profile: string): Promise<VaultProfile> {
  if (!vault.isUnlocked()) {
    if (!(await vault.exists())) {
      throw new BrowserToolError(
        `No credential vault exists yet — run enroll_credentials for ` +
          `"${profile}" first, or use source="prompt".`,
      );
    }
    const passphrase = await securePrompt.request({ kind: "passphrase", profile });
    await vault.unlock(passphrase);
  }
  return vault.get(profile);
}

async function detectIfNeeded(
  page: Page,
  input: AuthLoginInput,
  stored: VaultSelectors | undefined,
): Promise<DetectedFields> {
  const have = (ai: string | undefined, st: string | undefined): boolean =>
    Boolean((ai && ai.trim()) || (st && st.trim()));
  if (
    have(input.usernameSelector, stored?.username) &&
    have(input.passwordSelector, stored?.password) &&
    have(input.submitSelector, stored?.submit)
  ) {
    return EMPTY_FIELDS;
  }
  try {
    return await page.evaluate(detectFieldsInPage);
  } catch {
    return EMPTY_FIELDS;
  }
}

function resolveSelector(
  field: string,
  provided: string | undefined,
  stored: string | undefined,
  auto: string | null,
): ResolvedSelector {
  if (provided && provided.trim()) return { selector: provided, source: "provided" };
  if (stored && stored.trim()) return { selector: stored, source: "provided" };
  if (auto) return { selector: auto, source: "auto" };
  throw new BrowserToolError(
    `authenticate_login could not auto-detect the ${field} field. Pass an ` +
      `explicit ${field}Selector — use capture_page_screenshot or ` +
      "label_interactives to find it.",
  );
}

function deriveStatus(verdict: LoginVerdict): AuthStatus {
  if (verdict.challenge === "error") return "error";
  if (verdict.challenge === "otp") return "otp_required";
  if (verdict.challenge === "none") return "success";
  if (verdict.passwordFieldGone && !verdict.otpFieldPresent && !verdict.urlChanged) {
    return "push_wait";
  }
  return "unknown";
}

/** SSO success means: back on the destination origin, no password/OTP, no error. */
function deriveSsoStatus(
  verdict: LoginVerdict,
  destOrigin: string,
  currentUrl: string,
): AuthStatus {
  if (verdict.challenge === "error") return "error";
  if (verdict.otpFieldPresent) return "otp_required";
  if (verdict.passwordFieldGone && safeOrigin(currentUrl) === destOrigin) {
    return "success";
  }
  return "unknown";
}

function destinationOf(url: string): { origin: string; display: string } {
  try {
    const u = new URL(url);
    return { origin: u.origin, display: u.host };
  } catch {
    return { origin: url, display: "the current page" };
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
