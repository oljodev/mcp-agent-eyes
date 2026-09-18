/** Registers evaluate_script — only when AGENT_EYES_ALLOW_EVAL=1. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  optionalViewportField,
  reloadField,
  scriptField,
  urlField,
} from "../../types/index.js";
import { errorResult, metadataBlock, textBlock } from "../blocks.js";
import { healthBlock } from "../health-format.js";

/**
 * evaluate_script is an arbitrary-code escape hatch — only exposed when the
 * operator explicitly opts in, so a default install ships no eval surface.
 */
export function registerScriptTool(server: McpServer): void {
  if (process.env.AGENT_EYES_ALLOW_EVAL !== "1") {
    return;
  }
  server.registerTool(
    "evaluate_script",
    {
      title: "Evaluate JavaScript in the page (opt-in)",
      description:
        "Run a JS snippet in the page context and return its " +
        "JSON-serializable result as text — a tokenless escape hatch for " +
        "reading app state, seeding data, or triggering a function. The " +
        "snippet runs as an async function body (use await; you MUST " +
        "`return` a serializable value). Navigates first only when a url is " +
        "given, else runs on the open page. Capped length and runtime. " +
        "Enabled via AGENT_EYES_ALLOW_EVAL=1. Includes a page-health block.",
      inputSchema: {
        script: scriptField,
        url: urlField.optional(),
        viewport: optionalViewportField,
        reload: reloadField,
      },
    },
    async ({ script, url, viewport, reload }) => {
      try {
        const { result, health } = await session.evaluateScript(
          script,
          url,
          viewport,
          reload,
        );
        return {
          content: [
            textBlock(`Result:\n${result}`),
            healthBlock(health),
            metadataBlock(),
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
