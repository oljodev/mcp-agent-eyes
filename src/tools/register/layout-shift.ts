/** Registers measure_layout_shift (CLS). */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  maxClsField,
  optionalViewportField,
  urlField,
} from "../../types/index.js";
import {
  type Assertion,
  assertionBlock,
  errorResult,
  finalize,
  metadataBlock,
  textBlock,
} from "../blocks.js";
import { healthBlock } from "../health-format.js";
import { formatLayoutShift } from "../formatters/web-vitals.js";

export function registerLayoutShiftTool(server: McpServer): void {
  server.registerTool(
    "measure_layout_shift",
    {
      title: "Measure Cumulative Layout Shift (CLS)",
      description:
        "Cold-load CLS diagnostic: arms a layout-shift observer BEFORE the " +
        "page parses, reloads, watches ~2s, then reports the aggregate score " +
        "(good ≤ 0.10, poor > 0.25) and the exact elements that jumped, " +
        "ranked by attributed shift — jank no static screenshot shows. Zero " +
        "image tokens. Rebuilds a pristine page, discarding any in-page " +
        "state.",
      inputSchema: {
        url: urlField,
        viewport: optionalViewportField,
        maxCls: maxClsField,
      },
    },
    async ({ url, viewport, maxCls }) => {
      try {
        const { result, viewport: used, health } =
          await session.measureLayoutShift(url, viewport);
        const content = [
          textBlock(formatLayoutShift(result, session.currentUrl() ?? url, used)),
        ];
        const assertion: Assertion | null =
          maxCls !== undefined
            ? {
                ok: result.cls <= maxCls,
                label: `CLS ${result.cls.toFixed(4)} ${result.cls <= maxCls ? "≤" : ">"} ${maxCls} allowed`,
              }
            : null;
        if (assertion) {
          content.push(assertionBlock(assertion));
        }
        content.push(healthBlock(health), metadataBlock());
        return finalize(content, assertion);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
