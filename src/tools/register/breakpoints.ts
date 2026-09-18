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
        "Zero-image responsive stress test: step the viewport width from " +
        "minWidth to maxWidth and probe horizontal overflow at each stop, then " +
        "report the exact width ranges where the layout breaks — the " +
        "breakpoints the four named viewports skip over. Returns a compact " +
        "text ledger like '[768px - 815px]: CRITICAL OVERFLOW — selector " +
        "\"div.card-grid\" bleeds past viewport by 34px'. The sweep caps its " +
        "total probes to stay fast and restores the prior viewport afterwards. " +
        "Includes a page-health block.",
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
