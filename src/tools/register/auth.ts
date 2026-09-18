/** Registers authenticate_login and submit_2fa_code — AI-blind login + 2FA. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  assumeConsentField,
  authLoginUrlField,
  authOtpSelectorField,
  authPasswordSelectorField,
  authProfileField,
  authSubmitSelectorField,
  authUsernameSelectorField,
  credentialSourceField,
  loginFlowField,
  optionalViewportField,
  otpSourceField,
  ssoField,
} from "../../types/index.js";
import { errorResult, metadataBlock, textBlock } from "../blocks.js";
import { format2faStatus, formatLoginStatus } from "../formatters/auth.js";
import { healthBlock } from "../health-format.js";

export function registerAuthTools(server: McpServer): void {
  server.registerTool(
    "authenticate_login",
    {
      title: "Log in to a site without seeing the credentials",
      description:
        "Log the user into a website using THEIR account, without the AI ever " +
        "seeing the email/password. You supply selectors (non-secret); the " +
        "server opens a localhost secure page where the human types the " +
        "username + password into a masked field, fills them into the page, " +
        "submits, and returns ONLY a page status: success, otp_required (then " +
        "call submit_2fa_code), error, push_wait, or unknown. Selectors are " +
        "auto-detected when omitted (the response reports which were used, so " +
        "you can correct a wrong guess on retry). NEVER returns a screenshot " +
        "(a rejected/2FA page can expose secret values) — after success, use " +
        "capture_page_screenshot, then manage_session action=save to persist " +
        "the cookies for reuse. The call blocks until the human answers the " +
        "secure prompt (its URL is opened in their browser and logged to " +
        "stderr) or it times out after 180s. The FIRST sign-in to each new " +
        "site in a session shows a Continue/Cancel consent prompt (set " +
        "assumeConsent:true for unattended runs). For sites with " +
        '"Continue with Google"-style SSO, pass sso:"google" to reuse a shared ' +
        "provider session instead of a per-site password. Identifier-first " +
        "logins (email + Next, then password + Next — Google, Microsoft, Okta) " +
        "are driven across both steps automatically; no extra setup needed. " +
        "Includes a page-health block.",
      inputSchema: {
        profile: authProfileField,
        source: credentialSourceField,
        loginUrl: authLoginUrlField,
        usernameSelector: authUsernameSelectorField,
        passwordSelector: authPasswordSelectorField,
        submitSelector: authSubmitSelectorField,
        viewport: optionalViewportField,
        sso: ssoField,
        assumeConsent: assumeConsentField,
        flow: loginFlowField,
      },
    },
    async ({
      profile,
      source,
      loginUrl,
      usernameSelector,
      passwordSelector,
      submitSelector,
      viewport,
      sso,
      assumeConsent,
      flow,
    }) => {
      try {
        const result = await session.authenticateLogin({
          profile,
          source,
          loginUrl,
          usernameSelector,
          passwordSelector,
          submitSelector,
          viewport,
          sso,
          assumeConsent,
          flow,
        });
        return {
          content: [
            textBlock(formatLoginStatus(result)),
            healthBlock(result.health),
            metadataBlock(),
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "submit_2fa_code",
    {
      title: "Enter a 2FA code without seeing it",
      description:
        "Complete a two-factor challenge raised by authenticate_login, without " +
        "the AI ever seeing the code. The server opens a localhost secure page " +
        "where the human types the current one-time code, fills it into the " +
        "page's code field (auto-detected when codeSelector is omitted), " +
        "submits (or presses Enter if no submitSelector), and returns ONLY a " +
        "status: success (then manage_session action=save), error, or unknown. " +
        "Acts on the page authenticate_login left behind — never navigates. " +
        "Blocks until the human answers the secure prompt or times out after " +
        "180s. Includes a page-health block.",
      inputSchema: {
        source: otpSourceField,
        profile: authProfileField.optional(),
        codeSelector: authOtpSelectorField,
        submitSelector: authSubmitSelectorField,
      },
    },
    async ({ source, profile, codeSelector, submitSelector }) => {
      try {
        const result = await session.submit2faCode({
          source,
          profile,
          codeSelector,
          submitSelector,
        });
        return {
          content: [
            textBlock(format2faStatus(result)),
            healthBlock(result.health),
            metadataBlock(),
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
