/** Registers enroll_credentials — store credentials in the encrypted vault. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  authLoginUrlField,
  authOtpSelectorField,
  authPasswordSelectorField,
  authProfileField,
  authSubmitSelectorField,
  authUsernameSelectorField,
  enrollWithTotpField,
} from "../../types/index.js";
import { errorResult, metadataBlock, textBlock } from "../blocks.js";
import { healthBlock } from "../health-format.js";

export function registerEnrollTool(server: McpServer): void {
  server.registerTool(
    "enroll_credentials",
    {
      title: "Store credentials in the encrypted vault (for unattended login)",
      description:
        "Save a profile's credentials to the encrypted vault " +
        "(.agent-eyes/vault.json, AES-256-GCM) so later logins run with no " +
        "human present: authenticate_login source=vault and submit_2fa_code " +
        "source=totp pull from it. The human types every secret — the master " +
        "passphrase, username, password, and with withTotp the authenticator " +
        "seed — into the localhost prompt; the AI never sees any value. " +
        "Optionally stores loginUrl and form selectors too. Returns a " +
        "non-secret summary.",
      inputSchema: {
        profile: authProfileField,
        loginUrl: authLoginUrlField,
        withTotp: enrollWithTotpField,
        usernameSelector: authUsernameSelectorField,
        passwordSelector: authPasswordSelectorField,
        submitSelector: authSubmitSelectorField,
        otpSelector: authOtpSelectorField,
      },
    },
    async ({
      profile,
      loginUrl,
      withTotp,
      usernameSelector,
      passwordSelector,
      submitSelector,
      otpSelector,
    }) => {
      try {
        const result = await session.enrollCredentials({
          profile,
          loginUrl,
          withTotp,
          usernameSelector,
          passwordSelector,
          submitSelector,
          otpSelector,
        });
        const parts = [
          `Stored credentials for "${result.profile}" in the encrypted vault`,
          `(${result.count} profile${result.count === 1 ? "" : "s"} total).`,
          result.hasTotp ? "TOTP seed saved (2FA can run via source=totp)." : "",
          result.hasLoginUrl ? "Login URL saved." : "",
          result.storedSelectors.length
            ? `Selectors saved: ${result.storedSelectors.join(", ")}.`
            : "",
          'Use authenticate_login source="vault" profile="' +
            `${result.profile}" to log in unattended.`,
        ].filter(Boolean);
        return {
          content: [
            textBlock(parts.join(" ")),
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
