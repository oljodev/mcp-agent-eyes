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
        "Keep several real browser tabs open at once and switch between them by " +
        "a label you assign — e.g. work on a Lovable preview in one tab and a " +
        "test site in another without closing either. action=open opens a new " +
        "named tab (optionally navigating it) and makes it active; action=switch " +
        "makes an existing tab active; action=close closes a named tab (not the " +
        "last one); action=list returns every tab with its label/url/viewport and " +
        "which is active. All OTHER tools (capture_page_screenshot, " +
        "interact_and_audit, …) act on the ACTIVE tab. Tool calls are still " +
        "serialized; multi-tab just means the other tab's state survives. The " +
        "default tab is \"main\". Includes a page-health block.",
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
