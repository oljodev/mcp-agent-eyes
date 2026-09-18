/** Registers manage_tabs — open/switch/close/list named real-browser tabs. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import { tabActionField, tabLabelField, tabUrlField } from "../../types/index.js";
import { errorResult, metadataBlock, textBlock } from "../blocks.js";
import { healthBlock } from "../health-format.js";

export function registerManageTabsTool(server: McpServer): void {
  server.registerTool(
    "manage_tabs",
    {
      title: "Open and switch between multiple named browser tabs",
      description:
        "Keep several real tabs open at once and switch between them by a " +
        "label you assign — a preview in one, a staging site in another, " +
        "neither losing its state. open opens a named tab and makes it " +
        "active, switch activates an existing one, close closes one (never " +
        "the last), list returns each tab's label, url, viewport and active " +
        "flag. Every OTHER tool acts on the ACTIVE tab. The default tab is " +
        "\"main\".",
      inputSchema: {
        action: tabActionField,
        label: tabLabelField,
        url: tabUrlField,
      },
    },
    async ({ action, label, url }) => {
      try {
        const result = await session.manageTabs({ action, label, url });
        return {
          content: [
            textBlock(result.summary),
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
