/** Registers label_interactives (numbered set-of-mark overlay). */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import { optionalViewportField, reloadField, urlField } from "../../types/index.js";
import {
  errorResult,
  imageBlock,
  kb,
  metadataBlock,
  persistenceBlock,
  textBlock,
} from "../blocks.js";
import { healthBlock } from "../health-format.js";
import { formatMarkLegend } from "../formatters/marks.js";

export function registerLabelInteractivesTool(server: McpServer): void {
  server.registerTool(
    "label_interactives",
    {
      title: "Label interactive elements (set-of-mark)",
      description:
        "Set-of-mark prompting: paints a numbered badge over every " +
        "interactive element in the viewport — links, buttons, inputs, " +
        "selects, ARIA widgets, anything with a pointer cursor — and returns " +
        "the marked screenshot plus a legend mapping each number to a stable, " +
        "unique selector and its accessible label. Pick your target off the " +
        "picture by number, then act on its exact selector with " +
        "interact_and_audit. The overlay is removed after capture.",
      inputSchema: {
        url: urlField,
        viewport: optionalViewportField,
        reload: reloadField,
      },
    },
    async ({ url, viewport, reload }) => {
      try {
        const { image, marks, candidates, truncated, viewport: used, saved, run, galleryPath, health } =
          await session.labelInteractives(url, viewport, reload);
        return {
          content: [
            textBlock(
              `Marked ${marks.length} interactive element(s) on ${session.currentUrl() ?? url} ` +
                `[${image.mimeType.replace("image/", "")}, ${image.width}x${image.height}px, ${kb(image.bytes)}]\n` +
                `saved → ${saved.file}`,
            ),
            imageBlock(image),
            textBlock(formatMarkLegend(marks, candidates, truncated, session.currentUrl() ?? url, used)),
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
