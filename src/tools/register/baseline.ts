/** Registers compare_to_baseline. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  BASELINE_DIR,
  baselineActionField,
  baselineNameField,
  fullPageField,
  maxVariancePctField,
  reloadField,
  urlField,
  viewportField,
} from "../../types/index.js";
import {
  type Assertion,
  assertionBlock,
  errorResult,
  metadataBlock,
} from "../blocks.js";
import { healthBlock } from "../health-format.js";
import { formatBaselineResult } from "../formatters/baseline.js";

export function registerBaselineTool(server: McpServer): void {
  server.registerTool(
    "compare_to_baseline",
    {
      title: "Visual baseline: save or diff",
      description:
        "Visual regression checkpointing. With action \"set_baseline\", " +
        "renders the URL at the given breakpoint and saves a lossless " +
        `baseline PNG under ${BASELINE_DIR}/ (named per baselineName + ` +
        "viewport). With action \"diff_against_baseline\", re-renders and " +
        "pixel-diffs against the saved baseline, returning a variance " +
        "score, dimension-drift info, and a red-on-grayscale delta overlay " +
        "image — the overlay is also saved to the current run directory " +
        "and its path reported. With fullPage: true, baseline and diff " +
        "cover the ENTIRE scrollable height (stored as a separate baseline " +
        "file), eliminating below-the-fold blind spots. The scroll position " +
        "is always reset to the top before capturing, so prior scroll " +
        "interactions never misalign the comparison. Typical flow: set a " +
        "baseline before refactoring CSS, then diff after each change. " +
        "Responses include a page-health block.",
      inputSchema: {
        url: urlField,
        viewport: viewportField,
        action: baselineActionField,
        baselineName: baselineNameField,
        fullPage: fullPageField,
        reload: reloadField,
        maxVariancePct: maxVariancePctField,
      },
    },
    async ({ url, viewport, action, baselineName, fullPage, reload, maxVariancePct }) => {
      try {
        const { result, savedDiff, health } = await session.baseline(
          url,
          viewport,
          action,
          baselineName,
          fullPage,
          reload,
        );
        const formatted = formatBaselineResult(result, baselineName, savedDiff);
        let assertion: Assertion | null = null;
        if (
          maxVariancePct !== undefined &&
          result.action === "diff_against_baseline"
        ) {
          const ok = result.variancePct <= maxVariancePct;
          assertion = {
            ok,
            label:
              `variance ${result.variancePct.toFixed(3)}% ` +
              `${ok ? "≤" : ">"} ${maxVariancePct}% allowed`,
          };
        }
        if (assertion) {
          formatted.content.push(assertionBlock(assertion));
        }
        formatted.content.push(healthBlock(health), metadataBlock());
        return assertion && !assertion.ok
          ? { ...formatted, isError: true }
          : formatted;
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
