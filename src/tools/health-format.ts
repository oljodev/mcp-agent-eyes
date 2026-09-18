/** Renders the page-health block that accompanies EVERY tool response. */

import type { PageHealth } from "../types/health.js";
import { textBlock } from "./blocks.js";

/**
 * The health block accompanies EVERY tool response. It covers telemetry
 * gathered since the previous response (buffers are drained per
 * transaction), so errors never leak across unrelated steps.
 */
export function healthBlock(health: PageHealth) {
  const lines: string[] = [];

  if (health.blankPage?.blank) {
    lines.push(
      `[!] BLANK PAGE: ${health.blankPage.detail}. The app may have ` +
        "crashed before rendering (broken bundle, runtime error) — check " +
        "the errors below before trusting screenshots or spending more " +
        "image tokens on this page.",
    );
  }
  if (health.pageErrors.length > 0) {
    lines.push(`[!] Uncaught page exceptions (${health.pageErrors.length}):`);
    lines.push(...health.pageErrors.map((e) => `      - ${e}`));
  }
  if (health.consoleErrors.length > 0) {
    lines.push(`[!] Console errors (${health.consoleErrors.length}):`);
    lines.push(...health.consoleErrors.map((e) => `      - ${e}`));
  }
  if (health.failedRequests.length > 0) {
    lines.push(`[!] Failed requests (${health.failedRequests.length}):`);
    lines.push(...health.failedRequests.map((e) => `      - ${e}`));
  }
  if (health.httpErrors.length > 0) {
    lines.push(`[!] HTTP error responses (${health.httpErrors.length}):`);
    lines.push(...health.httpErrors.map((e) => `      - ${e}`));
  }
  if (health.dropped > 0) {
    lines.push(`      (+${health.dropped} more entries dropped)`);
  }

  if (lines.length === 0) {
    return textBlock(
      "Page health: OK — no console errors, failed requests, or blank-page " +
        "signals since the last check.",
    );
  }
  return textBlock(["PAGE HEALTH:", ...lines].join("\n"));
}
