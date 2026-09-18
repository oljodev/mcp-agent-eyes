/** Registers capture_element. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  optionalViewportField,
  reloadField,
  selectorField,
  urlField,
} from "../../types/index.js";
import {
  errorResult,
  imageBlock,
  kb,
  metadataBlock,
  persistenceBlock,
  textBlock,
  viewportLabel,
} from "../blocks.js";
import { healthBlock } from "../health-format.js";

export function registerCaptureElementTool(server: McpServer): void {
  server.registerTool(
    "capture_element",
    {
      title: "Capture a single element (cropped screenshot)",
      description:
        "Screenshot ONE element, cropped to its bounding box — far cheaper " +
        "than a full page when you only need a button, card, or nav. " +
        "Navigates, applies the optional viewport, scrolls the selector's " +
        "first match into view, and crops. The full-resolution crop is saved " +
        "to disk; a webp thumbnail goes on the wire.",
      inputSchema: {
        url: urlField,
        selector: selectorField,
        viewport: optionalViewportField,
        reload: reloadField,
      },
    },
    async ({ url, selector, viewport, reload }) => {
      try {
        const { capture, saved, box, run, galleryPath, health } =
          await session.captureElement(url, selector, viewport, reload);
        const dims = box ? `${box.width}x${box.height}px element` : "element";
        return {
          content: [
            textBlock(
              `Cropped ${dims} "${selector}" on ${session.currentUrl() ?? url} ` +
                `@ ${viewportLabel(saved.viewport)} ` +
                `[${capture.image.mimeType.replace("image/", "")}, ` +
                `${capture.image.width}x${capture.image.height}px, ${kb(capture.image.bytes)}]\n` +
                `saved → ${saved.file} (full-res ${saved.width}x${saved.height}px, ${kb(saved.bytes)})`,
            ),
            imageBlock(capture.image),
            persistenceBlock(run, galleryPath),
            healthBlock(health),
            metadataBlock(),
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
