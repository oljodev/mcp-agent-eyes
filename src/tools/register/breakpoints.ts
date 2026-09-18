/** Registers find_breakpoints. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  reloadField,
  sweepMaxWidthField,
  sweepMinWidthField,
  sweepStepField,
  urlField,
} from "../../types/index.js";
import { errorResult, metadataBlock, textBlock } from "../blocks.js";
import { healthBlock } from "../health-format.js";
import { formatBreakpoints } from "../formatters/breakpoints.js";

export function registerBreakpointsTool(server: McpServer): void {
  server.registerTool(
    "find_breakpoints",
    {
      title: "Find responsive breakpoints (width sweep)",
      description:
        "Zero-image responsive stress test: steps the viewport width from " +
        "minWidth to maxWidth, probing horizontal overflow at each stop, and " +
        "reports the exact width ranges where the layout breaks — the ones " +
        "the four named viewports skip over. Restores the prior viewport " +
        "afterwards.",
      inputSchema: {
        url: urlField,
        minWidth: sweepMinWidthField,
        maxWidth: sweepMaxWidthField,
        step: sweepStepField,
        reload: reloadField,
      },
    },
    async ({ url, minWidth, maxWidth, step, reload }) => {
      try {
        const { sweep, health } = await session.findBreakpoints(
          url,
          minWidth,
          maxWidth,
          step,
          reload,
        );
        return {
          content: [
            textBlock(formatBreakpoints(sweep, session.currentUrl() ?? url)),
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
