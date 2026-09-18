/** Registers capture_page_screenshot and matrix_responsive_audit. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  MATRIX_QUALITY,
  formatField,
  fullPageField,
  maxWidthField,
  qualityField,
  reloadField,
  sizeModeField,
  urlField,
  viewportField,
} from "../../types/index.js";
import {
  healthBlock,
} from "../health-format.js";
import {
  imageBlock,
  imageCaption,
  kb,
  metadataBlock,
  persistenceBlock,
  textBlock,
  viewportLabel,
  errorResult,
} from "../blocks.js";

export function registerCaptureTools(server: McpServer): void {
  server.registerTool(
    "capture_page_screenshot",
    {
      title: "Capture page screenshot",
      description:
        "Take a screenshot of a URL at a specific responsive breakpoint, " +
        "with image-degradation controls that minimize token cost: webp " +
        "(default, lossy q75), jpeg, or png, plus optional maxWidth " +
        'downscaling and sizeMode "thumb" for a tiny wire image. The ' +
        "full-resolution render is always saved under " +
        ".agent-eyes/captures/run-<n>-<page>/<shot-folder>/ and its absolute " +
        "path is reported. Initializes (or navigates) the persistent browser " +
        "session — cookies, logins, and page state survive across calls, " +
        "and re-requesting the already-open URL never reloads the page. " +
        "Every response includes a page-health block.",
      inputSchema: {
        url: urlField,
        viewport: viewportField,
        fullPage: fullPageField,
        format: formatField,
        quality: qualityField,
        maxWidth: maxWidthField,
        sizeMode: sizeModeField,
        reload: reloadField,
      },
    },
    async ({ url, viewport, fullPage, format, quality, maxWidth, sizeMode, reload }) => {
      try {
        const { capture, saved, run, galleryPath, health } =
          await session.capture(
            url,
            viewport,
            fullPage,
            { format, quality, maxWidth },
            sizeMode,
            reload,
          );
        return {
          content: [
            textBlock(
              `Screenshot of ${session.currentUrl() ?? url} at ` +
                `${viewportLabel(viewport)}${fullPage ? ", full page height" : ""} ` +
                `${imageCaption(capture)}\n` +
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

  server.registerTool(
    "matrix_responsive_audit",
    {
      title: "Responsive audit across all breakpoints",
      description:
        "Capture the same URL at ALL four responsive breakpoints — mobile " +
        "(393x852), tablet (768x1024), desktop (1440x900), and ultrawide " +
        `(1920x1080) — in a single call, aggressively compressed (webp ` +
        `q${MATRIX_QUALITY}) to keep four-image turns cheap; sizeMode ` +
        '"thumb" shrinks the wire images further. All four full-resolution ' +
        "renders are saved into one run directory and their paths reported. " +
        "Uses the same persistent browser session as " +
        "capture_page_screenshot; the previously active viewport is " +
        "restored afterwards. Includes a page-health block.",
      inputSchema: {
        url: urlField,
        fullPage: fullPageField,
        sizeMode: sizeModeField,
        reload: reloadField,
      },
    },
    async ({ url, fullPage, sizeMode, reload }) => {
      try {
        const { entries, run, galleryPath, health } =
          await session.captureMatrix(url, fullPage, sizeMode, reload);
        const totalBytes = entries.reduce(
          (sum, e) => sum + e.capture.image.bytes,
          0,
        );
        return {
          content: [
            textBlock(
              `Responsive audit of ${session.currentUrl() ?? url} across ` +
                `${entries.length} breakpoints` +
                `${fullPage ? " (full page height)" : ""} — ` +
                `${kb(totalBytes)} on the wire:`,
            ),
            ...entries.flatMap((entry) => [
              textBlock(
                `--- ${viewportLabel(entry.viewport)} ${imageCaption(entry.capture)} ---\n` +
                  `saved → ${entry.saved.file}`,
              ),
              imageBlock(entry.capture.image),
            ]),
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
