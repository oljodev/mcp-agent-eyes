/** Registers visual_diff_regions. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  fullPageField,
  maxVariancePctField,
  optionalViewportField,
  reloadField,
  tagField,
  urlField,
} from "../../types/index.js";
import {
  type Assertion,
  assertionBlock,
  errorResult,
  finalize,
  metadataBlock,
  persistenceBlock,
  textBlock,
} from "../blocks.js";
import { healthBlock } from "../health-format.js";
import { formatDiffRegions } from "../formatters/diff-regions.js";

export function registerDiffRegionsTool(server: McpServer): void {
  server.registerTool(
    "visual_diff_regions",
    {
      title: "Semantic visual diff (element-resolved regression)",
      description:
        "Visual regression that points at code, not pixels. Diffs the current " +
        "render against a saved baseline (by tag, per-viewport), clusters the " +
        "changed pixels into bounding-box regions (connected-component " +
        "analysis), and hit-tests each region's center against the live DOM to " +
        "name the element underneath — so instead of '3.2% of pixels changed' " +
        "you get an actionable list: 'button.cta-primary — 1,240 changed px'. " +
        "A human-viewable delta overlay is also saved to disk. Requires a " +
        "baseline saved via compare_to_baseline (set_baseline) — with matching " +
        "fullPage. Set fullPage:true to diff the entire scroll height (catching " +
        "below-the-fold regressions) instead of just the fold. Optionally pass " +
        "maxVariancePct as a CI gate. Includes a page-health block.",
      inputSchema: {
        url: urlField,
        tag: tagField,
        viewport: optionalViewportField,
        reload: reloadField,
        fullPage: fullPageField,
        maxVariancePct: maxVariancePctField,
      },
    },
    async ({ url, tag, viewport, reload, fullPage, maxVariancePct }) => {
      try {
        const { result, viewport: used, run, galleryPath, health } =
          await session.visualDiffRegions(url, tag, viewport, reload, fullPage);
        const content = [
          textBlock(
            formatDiffRegions(result, session.currentUrl() ?? url, used),
          ),
          persistenceBlock(run, galleryPath),
        ];
        const assertion: Assertion | null =
          maxVariancePct !== undefined
            ? {
                ok: result.variancePct <= maxVariancePct,
                label:
                  `variance ${result.variancePct.toFixed(3)}% ` +
                  `${result.variancePct <= maxVariancePct ? "≤" : ">"} ${maxVariancePct}% allowed`,
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
