/**
 * submit_2fa_code — fill the one-time-code field with a value the human enters
 * in the out-of-band secure prompt (the AI never sees it), submit, and classify
 * the result. Always acts on the page authenticate_login left behind (never
 * navigates — that would discard the challenge). Returns text status only.
 */

import { securePrompt } from "../auth/secure-prompt.js";
import { secrets } from "../auth/redact.js";
import { vault } from "../auth/vault.js";
import { BrowserToolError } from "../browser/errors.js";
import { settle } from "../browser/navigation.js";
import type { BrowserSession } from "../browser/session.js";
import { detectFieldsInPage } from "../inpage/detect-fields.js";
import type {
  Auth2faInput,
  Auth2faResult,
  LoginVerdict,
  ResolvedSelector,
} from "../types/auth.js";
import { ACTION_TIMEOUT_MS, REFLOW_PAUSE_MS } from "../types/timeouts.js";
import { clickSubmit, fillSecret, waitForLoginVerdict } from "./auth-fill.js";

export function submit2faCode(
  session: BrowserSession,
  input: Auth2faInput,
): Promise<Auth2faResult> {
  return session.core.runExclusive(async () => {
    const page = session.core.activePage();
    const beforeUrl = page.url();

    const codeSel = await resolveCodeSelector(input, page);
    const code =
      input.source === "totp"
        ? vaultTotp(input.profile)
        : await securePrompt.request({ kind: "otp", profile: input.profile });
    const disarm = secrets.arm(code);
    try {
      await fillSecret(page, codeSel.selector, code);

      let submitUsed: ResolvedSelector | null = null;
      if (input.submitSelector && input.submitSelector.trim()) {
        await clickSubmit(page, input.submitSelector);
        submitUsed = { selector: input.submitSelector, source: "provided" };
      } else {
        // Many OTP forms auto-submit on the last digit; Enter covers the rest.
        await page
          .locator(codeSel.selector)
          .first()
          .press("Enter", { timeout: ACTION_TIMEOUT_MS })
          .catch(() => undefined);
      }

      await page.waitForTimeout(REFLOW_PAUSE_MS);
      await settle(page);

      const verdict = await waitForLoginVerdict(page, beforeUrl);
      const health = secrets.scrubHealth(await session.core.drainHealth());
      return {
        status: derive2faStatus(verdict),
        verdict,
        usedSelectors: { code: codeSel, submit: submitUsed },
        url: page.url(),
        health,
      };
    } finally {
      disarm();
    }
  });
}

async function resolveCodeSelector(
  input: Auth2faInput,
  page: import("playwright-core").Page,
): Promise<ResolvedSelector> {
  if (input.codeSelector && input.codeSelector.trim()) {
    return { selector: input.codeSelector, source: "provided" };
  }
  let auto: string | null = null;
  try {
    auto = (await page.evaluate(detectFieldsInPage)).otp;
  } catch {
    auto = null;
  }
  if (!auto) {
    throw new BrowserToolError(
      "submit_2fa_code could not auto-detect the one-time-code field. Pass an " +
        "explicit codeSelector — take a capture_page_screenshot to find it.",
    );
  }
  return { selector: auto, source: "auto" };
}

function vaultTotp(profile: string | undefined): string {
  if (!profile) {
    throw new BrowserToolError(
      'source="totp" requires a "profile" naming the vault entry.',
    );
  }
  if (!vault.isUnlocked()) {
    throw new BrowserToolError(
      'The vault is locked. Run authenticate_login with source="vault" first ' +
        '(it unlocks the vault), then submit_2fa_code source="totp".',
    );
  }
  return vault.totp(profile);
}

function derive2faStatus(verdict: LoginVerdict): Auth2faResult["status"] {
  if (verdict.urlChanged && verdict.passwordFieldGone && !verdict.otpFieldPresent) {
    return "success";
  }
  if (verdict.errorText) {
    return "error";
  }
  return "unknown";
}
