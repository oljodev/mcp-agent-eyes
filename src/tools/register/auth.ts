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
        "Log the user into a site with THEIR account, without the AI ever " +
        "seeing the credentials. The human types username and password into a " +
        "localhost secure page; the server fills them in, submits, and " +
        "returns ONLY a status: success, otp_required (then call " +
        "submit_2fa_code), error, push_wait, or unknown. Selectors are " +
        "auto-detected when omitted, and the ones used are reported so a " +
        "retry can correct them. NEVER returns a screenshot, since a 2FA or " +
        "error page can render secrets — capture separately after success, " +
        "then manage_session action=save. Blocks until the human answers the " +
        "prompt or 180s elapse. The first sign-in to each new site asks for " +
        "consent unless assumeConsent is set.",
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
        "Complete a two-factor challenge raised by authenticate_login, " +
        "without the AI ever seeing the code. The human types the current " +
        "one-time code into a localhost secure page; the server fills the " +
        "auto-detected code field, submits, and returns ONLY a status: " +
        "success (then manage_session action=save), error, or unknown. Acts " +
        "on the page authenticate_login left behind and never navigates. " +
        "Blocks until answered or 180s elapse.",
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
