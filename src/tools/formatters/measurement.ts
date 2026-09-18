/** measure_element report formatting (incl. gradient-aware contrast). */

import type { ElementMeasurement } from "../../types/measurement.js";
import type { ViewportName } from "../../types/viewports.js";
import { viewportLabel } from "../blocks.js";
import { handle } from "./layout.js";

export function contrastVerdictText(c: {
  passesAA: boolean;
  passesAAA: boolean;
  isLargeText: boolean;
  largeAA: boolean;
  largeAAA: boolean;
}): string {
  if (c.isLargeText) {
    return c.largeAAA
      ? "passes large-text AA (3:1) and AAA (4.5:1)"
      : c.largeAA
        ? "passes large-text AA (3:1), fails AAA (4.5:1)"
        : "FAILS even large-text AA (3:1)";
  }
  return c.passesAAA
    ? "passes WCAG AA (4.5:1) and AAA (7:1)"
    : c.passesAA
      ? "passes WCAG AA (4.5:1), fails AAA (7:1)"
      : "FAILS WCAG AA (4.5:1)";
}

export function formatMeasurement(
  m: ElementMeasurement,
  requestedSelector: string,
  viewport: ViewportName,
): string {
  const c = m.contrast;
  const isLarge = c.kind === "gradient-unverifiable" ? false : c.isLargeText;

  const contrastLines: string[] =
    c.kind === "solid"
      ? [`Contrast:    ${c.ratio.toFixed(2)}:1 — ${contrastVerdictText(c)}`]
      : c.kind === "gradient-range"
        ? [
            `Contrast:    gradient background (${c.stopCount} parsed color stop${c.stopCount === 1 ? "" : "s"}) — ` +
              `ratio ranges ${c.worstRatio.toFixed(2)}:1 (worst stop) to ${c.bestRatio.toFixed(2)}:1 (best stop)`,
            `             worst-stop verdict: ${contrastVerdictText(c)}. Gradients vary ` +
              "by position — visual review recommended.",
            `             gradient: ${c.gradient.slice(0, 140)}${c.gradient.length > 140 ? "..." : ""}`,
          ]
        : [
            "Contrast:    Gradient Detected — Cannot auto-verify contrast " +
              "programmatically. Visual review required.",
            `             gradient: ${c.gradient.slice(0, 140)}${c.gradient.length > 140 ? "..." : ""}`,
          ];

  const lines = [
    `ELEMENT MEASUREMENT — ${handle(m.uniqueSelector, m.label)} @ ${viewportLabel(viewport)}`,
    `Matched:     first element for "${requestedSelector}"` +
      `${m.visible ? "" : " — WARNING: not currently visible (display/visibility/zero-size)"}`,
    `Box:         ${m.rect.width} x ${m.rect.height} px at (${m.rect.x}, ${m.rect.y}) — ` +
      `display: ${m.display}; position: ${m.position}`,
    `Typography:  font-family: ${m.typography.fontFamily}`,
    `             font-size: ${m.typography.fontSize}; font-weight: ${m.typography.fontWeight}; ` +
      `line-height: ${m.typography.lineHeight}` +
      `${isLarge ? " (large text per WCAG)" : ""}`,
    `Spacing:     padding: ${m.spacing.padding}; margin: ${m.spacing.margin}`,
    `Colors:      color: ${m.colors.color} on ${m.colors.backgroundColor} ` +
      `(background from ${m.colors.backgroundSource})`,
    ...contrastLines,
  ];
  if (!m.hasText) {
    lines.push(
      "Note:        element has no own text — the contrast verdict applies " +
        "only if text is rendered here.",
    );
  }
  return lines.join("\n");
}
