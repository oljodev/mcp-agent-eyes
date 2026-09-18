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
        "Reach authenticated pages. set adds cookies, localStorage seeds and " +
        "extra headers to the persistent session, applied to the live context " +
        "and replayed onto any future one so they survive a crash. save " +
        "snapshots cookies + localStorage to .agent-eyes/sessions/<name>.json " +
        "(gitignored — it holds plaintext tokens); load restores a snapshot " +
        "by recreating the context, after which you navigate to use it; clear " +
        "drops everything.",
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
