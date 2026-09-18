/** Registers manage_session. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  cookiesField,
  headersField,
  localStorageField,
  sessionActionField,
  sessionNameField,
} from "../../types/index.js";
import { errorResult, metadataBlock, textBlock } from "../blocks.js";
import { healthBlock } from "../health-format.js";

export function registerSessionTool(server: McpServer): void {
  server.registerTool(
    "manage_session",
    {
      title: "Manage auth/session state (cookies, storage, headers)",
      description:
        "Reach authenticated pages. action=set adds cookies, localStorage " +
        "seeds, and/or extra HTTP headers (e.g. an Authorization bearer " +
        "token) to the persistent session — applied immediately to the live " +
        "context and replayed onto any future context, so they survive a " +
        "crash. action=save snapshots the current cookies + localStorage to " +
        ".agent-eyes/sessions/<name>.json (gitignored — it holds tokens in " +
        "plaintext); action=load restores a snapshot by recreating the " +
        "context (then navigate with capture_page_screenshot to use it); " +
        "action=clear drops everything. Cookies use the Playwright addCookies " +
        "shape (each needs url, or domain+path). Includes a page-health block.",
      inputSchema: {
        action: sessionActionField,
        cookies: cookiesField,
        localStorage: localStorageField,
        headers: headersField,
        name: sessionNameField,
      },
    },
    async ({ action, cookies, localStorage, headers, name }) => {
      try {
        const { summary, health } = await session.manageSession({
          action,
          cookies,
          localStorage,
          headers,
          name,
        });
        return {
          content: [textBlock(summary), healthBlock(health), metadataBlock()],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
