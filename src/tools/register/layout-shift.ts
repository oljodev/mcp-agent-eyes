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
        "Cold-load Core Web Vitals diagnostic: arms a layout-shift " +
        "PerformanceObserver BEFORE the page parses, reloads, watches for ~2s, " +
        "then reports the aggregate CLS score (good ≤ 0.10, needs-improvement " +
        "≤ 0.25, poor > 0.25) AND the exact elements that jumped during load, " +
        "ranked by their attributed shift score — the invisible jank you can't " +
        "see in a static screenshot. Zero image tokens. NOTE: this rebuilds a " +
        "pristine page (cold load), discarding any prior in-page state. " +
        "Optionally pass maxCls as a CI gate. Includes a page-health block.",
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
