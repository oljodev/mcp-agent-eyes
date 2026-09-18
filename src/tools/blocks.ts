/**
 * MCP content-block helpers and the cross-tool presentation glue: image/text
 * blocks, captions, the persistence + version trailers, and the assertion /
 * CI-gate machinery shared by every tool registration.
 */

import { redact } from "../auth/redact.js";
import { BrowserToolError } from "../browser/errors.js";
import type { CaptureResult, EncodedImage } from "../types/images.js";
import type { ContrastVerdict } from "../types/measurement.js";
import type { RunInfo } from "../types/persistence.js";
import { VIEWPORTS, type ViewportName } from "../types/viewports.js";
import { SERVER_NAME, SERVER_VERSION } from "../version.js";

export function textBlock(text: string) {
  return { type: "text" as const, text };
}

export function imageBlock(image: EncodedImage) {
  return {
    type: "image" as const,
    data: image.data,
    mimeType: image.mimeType,
  };
}

export function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function viewportLabel(viewport: ViewportName): string {
  const { width, height } = VIEWPORTS[viewport];
  return `${viewport} (${width}x${height})`;
}

/** One-line provenance for an encoded image: format, size, dimensions. */
export function imageCaption(capture: CaptureResult): string {
  const { image } = capture;
  const parts = [
    image.mimeType.replace("image/", ""),
    `${image.width}x${image.height}px`,
    kb(image.bytes),
  ];
  let caption = `[${parts.join(", ")}]`;
  if (capture.truncatedToPx !== undefined) {
    caption +=
      ` — page is ${capture.documentHeightPx}px tall; capture clipped to the ` +
      `top ${capture.truncatedToPx}px to stay within model image limits`;
  }
  return caption;
}

/** The persistence trailer shown after a saving tool's main content. */
export function persistenceBlock(run: RunInfo, galleryPath: string) {
  return textBlock(
    `run: ${run.dir}\ngallery → ${galleryPath} (rebuilt; open in a browser for the contact sheet)`,
  );
}

/**
 * Version telemetry appended to EVERY tool response (success and error), so
 * the calling agent can verify it is talking to the freshly built server —
 * a stale, not-restarted process after `npm run build` shows its old
 * version here immediately.
 */
export function metadataBlock() {
  return textBlock(`[Metadata: ${SERVER_NAME} v${SERVER_VERSION}]`);
}

// --- assertion / CI-gate helpers ----------------------------------------------
//
// When a tool is given a threshold (maxIssues, maxVariancePct,
// requireContrast), it computes a pass/fail verdict, appends an explicit
// ASSERTION line, and — on failure — marks the whole response isError so a CI
// harness or an agent in a verify loop treats it as a hard failure rather than
// having to parse prose.

export interface Assertion {
  ok: boolean;
  label: string;
}

export function assertionBlock(assertion: Assertion) {
  const tag = assertion.ok ? "ASSERTION PASSED ✓" : "ASSERTION FAILED ✗";
  return textBlock(`${tag} — ${assertion.label}`);
}

/** Wrap a finished content array, flagging isError when an assertion failed. */
export function finalize(
  content: Array<ReturnType<typeof textBlock> | ReturnType<typeof imageBlock>>,
  assertion: Assertion | null,
) {
  return assertion && !assertion.ok ? { content, isError: true } : { content };
}

/** Does a contrast verdict satisfy the required WCAG level? */
export function contrastMeets(
  verdict: ContrastVerdict,
  level: "AA" | "AAA",
): { ok: boolean; detail: string } {
  if (verdict.kind === "gradient-unverifiable") {
    return {
      ok: false,
      detail: "gradient background could not be verified (fails closed)",
    };
  }
  const passes = level === "AA" ? verdict.passesAA : verdict.passesAAA;
  if (verdict.kind === "gradient-range") {
    return {
      ok: passes,
      detail: `gradient worst-stop vs WCAG ${level}`,
    };
  }
  return {
    ok: passes,
    detail: `${verdict.ratio.toFixed(2)}:1 vs WCAG ${level}`,
  };
}

/**
 * Convert any thrown value into an MCP tool error result. BrowserToolError
 * messages are already written for the agent; anything else is summarized so
 * the server never crashes mid-session because of one bad page.
 */
export function errorResult(error: unknown) {
  const message =
    error instanceof BrowserToolError
      ? error.message
      : error instanceof Error
        ? error.message
        : `Unexpected error: ${String(error)}`;
  // redact() scrubs any still-armed secret from the message (a no-op when no
  // auth op is mid-flight), so a thrown error can never carry one out.
  return {
    content: [textBlock(redact(`Error: ${message}`)), metadataBlock()],
    isError: true,
  };
}
