/** visual_diff_regions semantic-delta formatting. */

import type { VisualDiffRegionResult } from "../../types/diff-regions.js";
import type { ViewportName } from "../../types/viewports.js";
import { viewportLabel } from "../blocks.js";

export function formatDiffRegions(
  result: VisualDiffRegionResult,
  url: string,
  viewport: ViewportName,
): string {
  const lines = [
    `VISUAL DIFF (semantic) — ${url} @ ${viewportLabel(viewport)} vs baseline "${result.tag}"` +
      `${result.fullPage ? " [full page]" : ""}`,
    `${result.variancePct}% of pixels changed ` +
      `(${result.diffPixels.toLocaleString()} of ${result.totalPixels.toLocaleString()} px). ` +
      `${result.regions.length} change region(s) mapped to elements.`,
  ];
  if (result.truncatedToPx !== undefined) {
    lines.push(
      `  NOTE: page is ${result.documentHeightPx}px tall; the diff was clipped ` +
        `to the top ${result.truncatedToPx}px (model image cap).`,
    );
  }
  if (result.fullPage) {
    lines.push(
      "  (Full-page diff: regions below the fold are detected but may report " +
        "as unmapped, since element hit-testing only resolves the visible fold.)",
    );
  }
  const dimDrift =
    result.baselineSize.width !== result.currentSize.width ||
    result.baselineSize.height !== result.currentSize.height;
  if (dimDrift) {
    lines.push(
      `  DIMENSION DRIFT: baseline ${result.baselineSize.width}x${result.baselineSize.height}px ` +
        `vs current ${result.currentSize.width}x${result.currentSize.height}px.`,
    );
  }
  lines.push("");

  if (result.regions.length === 0) {
    lines.push(
      result.diffPixels === 0
        ? "[OK] IDENTICAL — no visual change against this baseline."
        : "Changes were detected but none mapped to a discrete element " +
            "(diffuse or below the fold). See the overlay below.",
    );
  } else {
    lines.push("Changed elements (largest change first):");
    for (const r of result.regions) {
      const label = r.label ? ` "${r.label}"` : "";
      lines.push(
        `  - ${r.tag} ${r.selector}${label} — ${r.changedPx.toLocaleString()} changed px ` +
          `(box ${r.box.width}x${r.box.height} at ${r.box.x},${r.box.y})`,
      );
    }
  }
  if (result.unmappedRegions > 0) {
    lines.push(
      "",
      `${result.unmappedRegions} change region(s) could not be mapped to an ` +
        "element (outside the current fold, or over removed content).",
    );
  }
  if (result.overlayFile) {
    lines.push(`overlay saved → ${result.overlayFile}`);
  }
  return lines.join("\n");
}
