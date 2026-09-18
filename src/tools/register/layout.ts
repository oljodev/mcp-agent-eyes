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
        "Zero-image, token-efficient layout diagnostics across ALL four " +
        "breakpoints in one call. At each of mobile (393x852), tablet " +
        "(768x1024), desktop (1440x900), and ultrawide (1920x1080), an " +
        "in-page script measures the DOM via getBoundingClientRect() and " +
        "scroll metrics, flagging: horizontal viewport overflow, container " +
        "spill/clip, silently truncated text, destructive bounding-box " +
        `collisions, and — on mobile — tap targets smaller than ` +
        `${MIN_TAP_TARGET_PX}x${MIN_TAP_TARGET_PX}px. Findings use UNIQUE, ` +
        "addressable selectors (anchored at the nearest stable id, " +
        ":nth-of-type chains, uniqueness asserted in-page) plus " +
        "human-readable labels. With annotate=true (default), every " +
        "breakpoint with findings also gets a red-outline annotated render " +
        "saved to the run directory (path reported, zero image tokens). Pass " +
        '"ignoreSelector" (a string or array) to exclude known, unfixable ' +
        "noise (fixed sidebars, cookie banners, third-party widgets) so new " +
        "issues stand out; the suppressed count is reported. Includes a " +
        "page-health block.",
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
