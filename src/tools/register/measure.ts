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
        "Zero-image element inspector: one element's live rendering spec from " +
        "getComputedStyle and getBoundingClientRect — dimensions, position, " +
        "typography, computed padding and margin, and ancestor-composited " +
        "foreground/background colors with a WCAG AA (4.5:1) / AAA (7:1) " +
        "contrast verdict including the large-text relaxation. Verifies " +
        "design-system and a11y specs without image tokens.",
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
