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
        "Build .agent-eyes/gallery.html — a sortable contact sheet of every " +
        "screenshot in a capture run, clean and annotated, each with URL, " +
        "viewport, tool, selector, timestamp, dimensions and issue count, " +
        "thumbnails linking to the full-resolution files. Aggregates every " +
        "run unless you scope it to one. Returns the gallery path for a human " +
        "to open.",
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
