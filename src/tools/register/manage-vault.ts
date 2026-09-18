/** Registers manage_vault — status / reset / change-passphrase for the vault. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import { vaultActionField } from "../../types/index.js";
import { errorResult, metadataBlock, textBlock } from "../blocks.js";
import { formatVaultStatus } from "../formatters/auth.js";
import { healthBlock } from "../health-format.js";

export function registerManageVaultTool(server: McpServer): void {
  server.registerTool(
    "manage_vault",
    {
      title: "Manage the encrypted credential vault (status / reset / rekey)",
      description:
        "Keep the credential vault recoverable. status reports whether a " +
        "vault exists, whether it is unlocked, and its profile names — never " +
        "secrets. reset permanently DELETES the vault after the human types " +
        "RESET into the secure prompt, the escape hatch for a forgotten " +
        "passphrase; re-enroll afterwards. change_passphrase re-encrypts " +
        "every profile under a new one.",
      inputSchema: {
        action: vaultActionField,
      },
    },
    async ({ action }) => {
      try {
        const result = await session.manageVault({ action });
        return {
          content: [
            textBlock(formatVaultStatus(result)),
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
