/** Registers scan_accessibility. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  maxIssuesField,
  optionalViewportField,
  reloadField,
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
import { formatAccessibilityReport } from "../formatters/accessibility.js";

export function registerAccessibilityTool(server: McpServer): void {
  server.registerTool(
    "scan_accessibility",
    {
      title: "Accessibility scan (text-only)",
      description:
        "Zero-image, token-efficient WCAG foundation audit of the live DOM. " +
        "Flags: (1) <img> elements missing alt attributes, or with empty " +
        'alt not declared decorative via role="presentation"; (2) heading ' +
        "hierarchy breaks — headings that skip a level (h2 → h4) or a " +
        "document whose first heading starts deeper than h2; (3) inputs, " +
        "selects, textareas, and buttons with no computable accessible " +
        "name (no label/aria-label/aria-labelledby/name-giving content — " +
        "placeholders don't count). Returns a grouped plain-text report " +
        "with unique, addressable selectors. Optionally resizes to a " +
        "breakpoint first. Includes a page-health block.",
      inputSchema: {
        url: urlField,
        viewport: optionalViewportField,
        reload: reloadField,
        maxIssues: maxIssuesField,
      },
    },
    async ({ url, viewport, reload, maxIssues }) => {
      try {
        const { scan, viewport: used, health } = await session.scanAccessibility(
          url,
          viewport,
          reload,
        );
        const content = [
          textBlock(
            formatAccessibilityReport(scan, session.currentUrl() ?? url, used),
          ),
        ];
        const totalIssues =
          scan.imageIssues.length +
          scan.headingIssues.length +
          scan.nameIssues.length;
        const assertion: Assertion | null =
          maxIssues !== undefined
            ? {
                ok: totalIssues <= maxIssues,
                label:
                  `${totalIssues} a11y issue(s) ` +
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
