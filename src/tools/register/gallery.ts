/** Registers generate_audit_gallery. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import { runIdField } from "../../types/index.js";
import { errorResult, metadataBlock, textBlock } from "../blocks.js";

export function registerGalleryTool(server: McpServer): void {
  server.registerTool(
    "generate_audit_gallery",
    {
      title: "Generate the audit gallery contact sheet",
      description:
        "Build (or rebuild) .agent-eyes/gallery.html — a sortable thumbnail " +
        "contact sheet of every screenshot saved in a capture run: clean " +
        "shots and annotated overlays, each with URL, viewport, tool, " +
        "action/selector, timestamp, dimensions, and layout-issue count, " +
        "with thumbnails linking to the full-resolution files on disk. " +
        "By default it aggregates EVERY run into one sheet (newest run first) " +
        "so all screenshots live in one place; pass run to scope it to a " +
        "single run. Returns the absolute path to the gallery — open it in a " +
        "browser for human review.",
      inputSchema: {
        run: runIdField,
      },
    },
    async ({ run }) => {
      try {
        const result = await session.generateGallery(run);
        const scope = result.runId
          ? `for ${result.runId}`
          : `across all ${result.runCount} run${result.runCount === 1 ? "" : "s"}`;
        return {
          content: [
            textBlock(
              `Gallery generated ${scope} (${result.shotCount} ` +
                `shot${result.shotCount === 1 ? "" : "s"}).\n` +
                `gallery → ${result.file}\n` +
                "Open it in a browser to review thumbnails, metadata, and " +
                "full-resolution captures.",
            ),
            metadataBlock(),
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
