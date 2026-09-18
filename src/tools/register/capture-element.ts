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
        "Screenshot JUST one element, cropped tight to its bounding box via " +
        "Playwright's element screenshot — far cheaper in tokens than a full " +
        "page when you only need to look at one component (a button, a card, a " +
        "nav). Navigates and applies the optional viewport first, resolves the " +
        "selector's first match, scrolls it into view, and crops. The " +
        "full-resolution crop is saved under .agent-eyes/captures/ and its " +
        "path reported; a small webp thumbnail is returned on the wire. " +
        "Includes a page-health block.",
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
