/** find_breakpoints responsive-sweep ledger formatting. */

import type { BreakpointBand, BreakpointSweep } from "../../types/breakpoints.js";

function bandRange(b: BreakpointBand): string {
  return b.minWidth === b.maxWidth
    ? `[${b.minWidth}px]`
    : `[${b.minWidth}px - ${b.maxWidth}px]`;
}

export function formatBreakpoints(sweep: BreakpointSweep, url: string): string {
  const overflowBands = sweep.bands.filter((b) => b.status === "overflow");
  const lines = [
    `RESPONSIVE SWEEP — ${url}`,
    `Probed ${sweep.samples} widths from ${sweep.minWidth}px to ${sweep.maxWidth}px ` +
      `(step ${sweep.step}px, height ${sweep.height}px). ` +
      `${overflowBands.length} overflow band(s) found.`,
    "",
  ];
  for (const b of sweep.bands) {
    if (b.status === "healthy") {
      lines.push(`${bandRange(b)}: Healthy`);
    } else if (b.selector) {
      const label = b.label ? ` "${b.label}"` : "";
      const docNote =
        b.maxDocOverflowPx > b.maxElementOverflowPx
          ? ` (document scrolls ${b.maxDocOverflowPx}px)`
          : "";
      lines.push(
        `${bandRange(b)}: CRITICAL OVERFLOW — selector ${b.selector}${label} ` +
          `bleeds past the viewport by ${b.maxElementOverflowPx}px${docNote}`,
      );
    } else {
      lines.push(
        `${bandRange(b)}: CRITICAL OVERFLOW — the document overflows its ` +
          `viewport by ${b.maxDocOverflowPx}px (no single offending element pinned)`,
      );
    }
  }
  if (overflowBands.length === 0) {
    lines.push("", "[OK] No horizontal overflow at any probed width.");
  }
  return lines.join("\n");
}
