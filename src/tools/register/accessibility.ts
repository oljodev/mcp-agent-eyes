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
        "Zero-image WCAG foundation audit of the live DOM. Flags <img> " +
        "missing alt (or empty alt not declared decorative), heading " +
        "hierarchy breaks (h2 → h4, or a document whose first heading starts " +
        "deeper than h2), and inputs, selects, textareas and buttons with no " +
        "computable accessible name — placeholders do not count. Grouped text " +
        "report with unique, addressable selectors.",
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
