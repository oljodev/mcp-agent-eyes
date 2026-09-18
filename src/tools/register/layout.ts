/** Registers detect_layout_matrix. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import { countLayoutIssues } from "../../browser/layout-scan.js";
import {
  MIN_TAP_TARGET_PX,
  annotateField,
  ignoreSelectorField,
  maxIssuesField,
  reloadField,
  urlField,
} from "../../types/index.js";
import { toSelectorList } from "../selectors.js";
import {
  type Assertion,
  assertionBlock,
  errorResult,
  finalize,
  metadataBlock,
  persistenceBlock,
  textBlock,
  viewportLabel,
} from "../blocks.js";
import { healthBlock } from "../health-format.js";
import { formatScanSections } from "../formatters/layout.js";

export function registerLayoutTool(server: McpServer): void {
  server.registerTool(
    "detect_layout_matrix",
    {
      title: "Layout diagnostics across all breakpoints (text-only)",
      description:
        "Zero-image layout diagnostics across all four breakpoints in one " +
        "call. An in-page script measures the DOM and flags horizontal " +
        "overflow, container spill or clipping, silently truncated text, " +
        "destructive collisions, and sub-44px tap targets on mobile. Findings " +
        "carry unique, addressable selectors. With annotate (default on), " +
        "each breakpoint with findings also gets a red-outline render saved " +
        "to disk and reported by path, costing no image tokens.",
      inputSchema: {
        url: urlField,
        annotate: annotateField,
        reload: reloadField,
        maxIssues: maxIssuesField,
        ignoreSelector: ignoreSelectorField,
      },
    },
    async ({ url, annotate, reload, maxIssues, ignoreSelector }) => {
      try {
        const { entries, run, galleryPath, health } =
          await session.layoutMatrix(
            url,
            annotate,
            reload,
            toSelectorList(ignoreSelector),
          );
        const reportUrl = session.currentUrl() ?? url;
        const totalIssues = entries.reduce(
          (sum, e) => sum + countLayoutIssues(e.scan),
          0,
        );
        const lines: string[] = [
          `LAYOUT MATRIX — ${reportUrl}`,
          `${totalIssues} issue(s) across ${entries.length} breakpoints. ` +
            `Per-breakpoint: ${entries
              .map((e) => `${e.viewport}=${countLayoutIssues(e.scan)}`)
              .join(", ")}.`,
        ];
        for (const entry of entries) {
          lines.push(
            "",
            `== ${viewportLabel(entry.viewport)} — ` +
              `document ${entry.scan.documentWidth}x${entry.scan.documentHeight}px, ` +
              `${countLayoutIssues(entry.scan)} issue(s) ==`,
            ...formatScanSections(entry.scan),
          );
          if (entry.annotatedShot) {
            lines.push(
              `  annotated overlay saved → ${entry.annotatedShot.file}`,
            );
          }
        }
        const content = [textBlock(lines.join("\n"))];
        if (run && galleryPath) {
          content.push(persistenceBlock(run, galleryPath));
        }
        const assertion: Assertion | null =
          maxIssues !== undefined
            ? {
                ok: totalIssues <= maxIssues,
                label:
                  `${totalIssues} layout issue(s) ` +
                  `${totalIssues <= maxIssues ? "≤" : ">"} ${maxIssues} allowed`,
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
