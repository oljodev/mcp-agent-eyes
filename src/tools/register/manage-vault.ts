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
        "Make the credential vault recoverable and manageable. action=status " +
        "reports whether a vault exists, whether it's unlocked, and its profile " +
        "names (never secrets). action=reset permanently DELETES the vault file " +
        "— the escape hatch when the master passphrase is forgotten — after the " +
        "human types RESET into the secure prompt; you then re-enroll from " +
        "scratch. action=change_passphrase re-encrypts every stored profile " +
        "under a new master passphrase (entered twice in the secure prompt; the " +
        "old one is required first if the vault is locked). The AI triggers " +
        "these; the human confirms in the localhost prompt. Returns a non-secret " +
        "summary + a page-health block.",
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
