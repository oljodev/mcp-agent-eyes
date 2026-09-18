/**
 * Shared zod field schemas reused across tools so every tool describes
 * identical arguments identically — important for clients (Zed, VS Code) that
 * route on schemas. This file holds the general capture / viewport / image /
 * assertion-gate fields.
 *
 * Descriptions are deliberately terse. Every one of them is re-serialized into
 * the tools/list payload for EACH tool that uses the field, and that payload is
 * resent on every request — `reload` alone used to cost ~1.2k tokens per
 * request across its 14 tools. State what the argument does, what it defaults
 * to, and anything that changes the caller's choice; the reasoning belongs in
 * the README.
 */

import { z } from "zod";

import {
  DEFAULT_FORMAT,
  DEFAULT_QUALITY,
  IMAGE_FORMATS,
  MAX_CAPTURE_HEIGHT_PX,
  SIZE_MODES,
  THUMB_MAX_WIDTH,
} from "../images.js";
import { VIEWPORT_NAMES } from "../viewports.js";

export const urlField = z
  .string()
  .min(1)
  .describe("Absolute URL to open, e.g. http://localhost:5173.");

export const viewportField = z
  .enum(VIEWPORT_NAMES)
  .describe(
    "Breakpoint: mobile 393x852, tablet 768x1024, desktop 1440x900, " +
      "ultrawide 1920x1080.",
  );

export const optionalViewportField = z
  .enum(VIEWPORT_NAMES)
  .optional()
  .describe(
    "Switch to this breakpoint first. Default: keep the current one.",
  );

export const fullPageField = z
  .boolean()
  .default(false)
  .describe(
    "Capture the whole scrollable page instead of the visible fold. Clipped " +
      `at ${MAX_CAPTURE_HEIGHT_PX}px, and the truncation is reported.`,
  );

export const formatField = z
  .enum(IMAGE_FORMATS)
  .default(DEFAULT_FORMAT)
  .describe(
    "webp (default) and jpeg are lossy and cheap; png is lossless and 3-5x " +
      "more tokens.",
  );

export const qualityField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(DEFAULT_QUALITY)
  .describe(
    `Lossy quality 1-100 (default ${DEFAULT_QUALITY}). Lower = fewer tokens. ` +
      "Ignored for png.",
  );

export const maxWidthField = z
  .number()
  .int()
  .min(64)
  .max(3840)
  .optional()
  .describe(
    "Downscale the returned image to this width before encoding — the " +
      "strongest token lever. The copy saved to disk stays full resolution.",
  );

export const sizeModeField = z
  .enum(SIZE_MODES)
  .default("full-res")
  .describe(
    `What goes over the wire: "full-res" (default), or "thumb" for a ` +
      `${THUMB_MAX_WIDTH}px webp. Disk always gets the full-resolution image.`,
  );

export const reloadField = z
  .boolean()
  .default(false)
  .describe(
    "Reload even if the URL is already open (default reuses it, so it can " +
      "be stale after an edit).",
  );

export const maxIssuesField = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe(
    "CI gate: mark the response a FAILURE when issues exceed this (0 = must " +
      "be clean). Omit to report without a verdict.",
  );

export const maxSmellsField = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe(
    "CI gate: mark the response a FAILURE when design smells exceed this " +
      "(0 = spotless). Omit to report without a verdict.",
  );

export const saveAsField = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe("Also save the tokens to .agent-eyes/styles/<name>.json.");

export const maxPagesField = z
  .number()
  .int()
  .min(1)
  .max(12)
  .default(6)
  .describe(
    "Same-origin pages to crawl (default 6, max 12). Nav links first, then " +
      "footer, then the rest.",
  );

export const requireContrastField = z
  .enum(["AA", "AAA"])
  .optional()
  .describe(
    "CI gate: FAIL when text/background contrast misses this WCAG level " +
      "(AA 4.5:1, AAA 7:1, large-text relaxation applies). Unverifiable " +
      "gradients fail closed.",
  );

export const annotateField = z
  .boolean()
  .default(true)
  .describe(
    "Default true: viewports with issues also get an annotated screenshot " +
      "saved to disk. Never returned, so it costs no image tokens.",
  );

export const runIdField = z
  .string()
  .min(1)
  .optional()
  .describe(
    'Run to scope the gallery to, e.g. "run-1-home". Omit to aggregate all ' +
      "runs.",
  );
