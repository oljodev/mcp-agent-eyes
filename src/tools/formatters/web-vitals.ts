/** measure_layout_shift (CLS) report formatting. */

import type { CLSBand, LayoutShiftResult } from "../../types/web-vitals.js";
import type { ViewportName } from "../../types/viewports.js";
import { viewportLabel } from "../blocks.js";

function bandText(band: CLSBand): string {
  switch (band) {
    case "good":
      return "GOOD (≤ 0.10 — passes Core Web Vitals)";
    case "needs-improvement":
      return "NEEDS IMPROVEMENT (0.10–0.25)";
    case "poor":
      return "POOR (> 0.25 — FAILED Core Web Vitals)";
  }
}

export function formatLayoutShift(
  result: LayoutShiftResult,
  url: string,
  viewport: ViewportName,
): string {
  const lines = [
    `LAYOUT SHIFT (CLS) — ${url} @ ${viewportLabel(viewport)}`,
    `CLS Score: ${result.cls.toFixed(4)} — ${bandText(result.band)}`,
    `Observed ${result.shiftCount} layout shift(s) over a ${result.windowMs}ms ` +
      "window after load.",
  ];
  if (!result.hadData) {
    lines.push(
      "",
      "[NOTE] The layout-shift observer never reported — the browser may not " +
        "support the layout-shift API, or the page blocked it. The score above " +
        "is unreliable.",
    );
    return lines.join("\n");
  }
  if (result.offenders.length > 0) {
    lines.push("", "Worst-offending elements (by attributed shift score):");
    for (const o of result.offenders) {
      const label = o.label ? ` "${o.label}"` : "";
      lines.push(`  - ${o.selector}${label} — contributed ${o.value.toFixed(4)}`);
    }
    lines.push(
      "",
      "Fix: reserve space for these (set width/height or aspect-ratio on images/" +
        "embeds, avoid inserting content above existing content, preload fonts).",
    );
  } else if (result.cls === 0) {
    lines.push("", "[OK] No layout shift detected — the page renders stably.");
  }
  return lines.join("\n");
}
