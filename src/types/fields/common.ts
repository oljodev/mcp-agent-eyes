/**
 * Shared zod field schemas reused across tools so every tool describes
 * identical arguments identically — important for clients (Zed, VS Code) that
 * route on schemas. This file holds the general capture / viewport / image /
 * assertion-gate fields.
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
  .describe(
    "Absolute URL of the page to inspect, e.g. http://localhost:5173 or " +
      "https://example.com.",
  );

export const viewportField = z
  .enum(VIEWPORT_NAMES)
  .describe(
    "Responsive breakpoint to render at: mobile (393x852), tablet " +
      "(768x1024), desktop (1440x900), or ultrawide (1920x1080).",
  );

export const optionalViewportField = z
  .enum(VIEWPORT_NAMES)
  .optional()
  .describe(
    "Optional: switch to this breakpoint (and wait for the reflow to " +
      "settle) BEFORE resolving the selector — e.g. target a hamburger " +
      "button that only exists on mobile without a separate resize call. " +
      "Omitted = keep the currently active viewport.",
  );

export const fullPageField = z
  .boolean()
  .default(false)
  .describe(
    "If true, capture the entire scrollable height of the page instead of " +
      "just the visible viewport fold. Very tall pages are clipped at " +
      `${MAX_CAPTURE_HEIGHT_PX}px and the truncation is reported.`,
  );

export const formatField = z
  .enum(IMAGE_FORMATS)
  .default(DEFAULT_FORMAT)
  .describe(
    "Image encoding. webp (default) and jpeg are lossy and cheap in tokens; " +
      "png is lossless but typically 3-5x more expensive. Prefer webp " +
      "unless pixel-perfect fidelity is required.",
  );

export const qualityField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(DEFAULT_QUALITY)
  .describe(
    "Lossy compression quality 1-100 (default 75). Lower = fewer tokens. " +
      "Ignored when format is png.",
  );

export const maxWidthField = z
  .number()
  .int()
  .min(64)
  .max(3840)
  .optional()
  .describe(
    "Optional: downscale the returned image to at most this many pixels " +
      "wide before encoding. Powerful token lever — e.g. 800 keeps desktop " +
      "layouts legible at a fraction of the cost. The image saved to disk " +
      "stays full resolution.",
  );

export const sizeModeField = z
  .enum(SIZE_MODES)
  .default("full-res")
  .describe(
    'What to return over the wire. "full-res" (default) returns the ' +
      'normally encoded image; "thumb" returns a small ' +
      `${THUMB_MAX_WIDTH}px webp thumbnail to save tokens. Either way the ` +
      "full-resolution image is saved to disk and its path is reported.",
  );

export const reloadField = z
  .boolean()
  .default(false)
  .describe(
    "Force a full reload even when the requested URL is already open. By " +
      "default the persistent session reuses the open page (re-requesting " +
      "the same URL never reloads) — fast, but it can serve a STALE render " +
      "after you edit code, since hot-reload may leave the page on an old " +
      "or crashed state. Set true in a fix→verify loop to guarantee the " +
      "latest version is captured.",
  );

export const maxIssuesField = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe(
    "Assertion / CI gate. If set, the response is marked a FAILURE " +
      "(isError) when the number of issues found exceeds this threshold; " +
      "pass 0 to require a completely clean result. Omit to just report " +
      "findings without a pass/fail verdict.",
  );

export const maxSmellsField = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe(
    "Assertion / CI gate. If set, the response is marked a FAILURE " +
      "(isError) when the number of design smells exceeds this threshold; " +
      "pass 0 to require a spotless design pass. Omit to just report.",
  );

export const saveAsField = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe(
    "Optional: also save the extracted tokens to " +
      ".agent-eyes/styles/<name>.json so you can reuse or lock this style " +
      "across the build.",
  );

export const maxPagesField = z
  .number()
  .int()
  .min(1)
  .max(12)
  .default(6)
  .describe(
    "How many same-origin pages to crawl (default 6, max 12). Nav/header " +
      "links are visited first, then footer, then the rest.",
  );

export const requireContrastField = z
  .enum(["AA", "AAA"])
  .optional()
  .describe(
    "Assertion / CI gate. If set, the response is marked a FAILURE " +
      "(isError) when the element's text/background contrast does not meet " +
      "the named WCAG level (AA 4.5:1, AAA 7:1; the large-text relaxation " +
      "applies). Gradient backgrounds that cannot be verified fail closed. " +
      "Omit to just report the contrast verdict.",
  );

export const annotateField = z
  .boolean()
  .default(true)
  .describe(
    "If true (default), viewports with issues get an extra annotated " +
      "screenshot saved to disk: the offending elements are outlined with " +
      "bold red boxes so mathematical findings map to visual ground truth. " +
      "Annotated shots are only saved, never returned as base64 — they " +
      "cost zero image tokens.",
  );

export const runIdField = z
  .string()
  .min(1)
  .optional()
  .describe(
    'Run to scope the gallery to, e.g. "run-1-home" or "run-3-pricing". ' +
      "Omit to aggregate every run into one sheet (the default).",
  );
