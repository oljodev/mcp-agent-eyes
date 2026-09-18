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
        "Save a profile's credentials to the encrypted credential vault " +
        "(.agent-eyes/vault.json, AES-256-GCM) so future logins run WITHOUT a " +
        "human present: authenticate_login source=vault and submit_2fa_code " +
        "source=totp then pull from it. The human types every secret (a vault " +
        "master passphrase the first time, then the username, password, and — " +
        "if withTotp — the authenticator setup key) into the localhost secure " +
        "prompt; the AI only triggers the flow and never sees any value. " +
        "Optionally store the loginUrl and form selectors so the unattended " +
        "login needs nothing but the profile name. Returns a non-secret " +
        "summary. The vault is encrypted at rest and gitignored.",
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
