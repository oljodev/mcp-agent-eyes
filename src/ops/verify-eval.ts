/**
 * Pure assertion evaluation for verify_fix — given a measured element, decide
 * PASS/FAIL and format the measured-vs-expected strings. Kept free of any
 * browser/page dependency so it is trivially unit-testable with mocked
 * measurements (the exact thing that would have caught "claimed 32px, live H1
 * still desktop-size").
 */

import type { VerifyAssertion, VerifyCheckResult } from "../types/verify.js";

/** What the op extracts per element (a thin slice of ElementMeasurement). */
export interface MeasuredElement {
  found: boolean;
  rect?: { x: number; width: number; height: number };
  fontSizePx?: number;
}

/** Sub-pixel tolerance so a 390.0 vs 390.4 layout rounding isn't a false fail. */
const EPS = 0.5;
const DEFAULT_TAP_PX = 44;

export function evaluateCheck(
  check: VerifyAssertion,
  m: MeasuredElement,
  viewportWidth: number,
): VerifyCheckResult {
  const base = { selector: check.selector, assert: check.assert };

  if (check.assert === "exists") {
    return { ...base, ok: m.found, measured: m.found ? "present" : "absent", expected: "present" };
  }
  if (check.assert === "notExists") {
    return { ...base, ok: !m.found, measured: m.found ? "present" : "absent", expected: "absent" };
  }
  if (!m.found || !m.rect) {
    return { ...base, ok: false, measured: "(element not found)", expected: describe(check, viewportWidth) };
  }

  const { rect } = m;
  switch (check.assert) {
    case "noViewportOverflow": {
      const rightEdge = round(rect.x + rect.width);
      return {
        ...base,
        ok: rightEdge <= viewportWidth + EPS,
        measured: `right edge ${rightEdge}px`,
        expected: `≤ ${viewportWidth}px (viewport)`,
      };
    }
    case "minTapTarget": {
      const px = check.px ?? DEFAULT_TAP_PX;
      const w = round(rect.width);
      const h = round(rect.height);
      return {
        ...base,
        ok: w >= px - EPS && h >= px - EPS,
        measured: `${w}x${h}`,
        expected: `≥ ${px}x${px}`,
      };
    }
    case "fontSizeAtMost":
    case "fontSizeAtLeast": {
      if (check.px === undefined) {
        return { ...base, ok: false, measured: "(no px given)", expected: "px threshold required" };
      }
      const size = m.fontSizePx ?? NaN;
      const ok =
        check.assert === "fontSizeAtMost"
          ? size <= check.px + EPS
          : size >= check.px - EPS;
      return {
        ...base,
        ok,
        measured: Number.isFinite(size) ? `${round(size)}px` : "(unreadable)",
        expected: `${check.assert === "fontSizeAtMost" ? "≤" : "≥"} ${check.px}px`,
      };
    }
    default:
      return { ...base, ok: false, measured: "(unknown assert)", expected: String(check.assert) };
  }
}

function describe(check: VerifyAssertion, viewportWidth: number): string {
  switch (check.assert) {
    case "noViewportOverflow":
      return `≤ ${viewportWidth}px (viewport)`;
    case "minTapTarget":
      return `≥ ${check.px ?? DEFAULT_TAP_PX}px`;
    case "fontSizeAtMost":
      return `≤ ${check.px ?? "?"}px`;
    case "fontSizeAtLeast":
      return `≥ ${check.px ?? "?"}px`;
    default:
      return String(check.assert);
  }
}

function round(n: number): number {
  return Math.round(n);
}
