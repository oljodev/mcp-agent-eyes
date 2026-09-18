/** Registers measure_element. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  optionalViewportField,
  reloadField,
  requireContrastField,
  selectorField,
  urlField,
} from "../../types/index.js";
import {
  type Assertion,
  assertionBlock,
  contrastMeets,
  errorResult,
  finalize,
  metadataBlock,
  textBlock,
} from "../blocks.js";
import { healthBlock } from "../health-format.js";
import { formatMeasurement } from "../formatters/measurement.js";

export function registerMeasureTool(server: McpServer): void {
  server.registerTool(
    "measure_element",
    {
      title: "Measure an element (tokenless inspector)",
      description:
        "Zero-image element inspector: extracts one element's exact live " +
        "rendering spec via getComputedStyle() and getBoundingClientRect() " +
        "— rendered dimensions and position, typography (font-family/size/" +
        "weight/line-height), computed padding and margin, and effective " +
        "foreground/background colors (ancestor-composited) with a WCAG " +
        "contrast ratio verdict against AA (4.5:1) and AAA (7:1), including " +
        "the large-text relaxation. Optionally resizes to a breakpoint " +
        "first, so responsive-only styles are measured where they apply. " +
        "Pure text — use it to verify design-system specs or a11y without " +
        "spending image tokens. Includes a page-health block.",
      inputSchema: {
        url: urlField,
        selector: selectorField,
        viewport: optionalViewportField,
        reload: reloadField,
        requireContrast: requireContrastField,
      },
    },
    async ({ url, selector, viewport, reload, requireContrast }) => {
      try {
        const { measurement, viewport: used, health } =
          await session.measureElement(url, selector, viewport, reload);
        const content = [
          textBlock(formatMeasurement(measurement, selector, used)),
        ];
        let assertion: Assertion | null = null;
        if (requireContrast) {
          const { ok, detail } = contrastMeets(
            measurement.contrast,
            requireContrast,
          );
          assertion = { ok, label: detail };
        }
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
