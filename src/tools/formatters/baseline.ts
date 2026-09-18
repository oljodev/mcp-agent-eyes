/** compare_to_baseline result formatting (set + diff). */

import type { BaselineResult } from "../../types/baselines.js";
import type { SavedShot } from "../../types/persistence.js";
import { imageBlock, kb, textBlock } from "../blocks.js";

export function formatBaselineResult(
  result: BaselineResult,
  name: string,
  savedDiff: SavedShot | null,
) {
  if (result.action === "set_baseline") {
    return {
      content: [
        textBlock(
          `${result.fullPage ? "Full-page baseline" : "Baseline"} "${name}" ` +
            `saved to ${result.file} ` +
            `(${result.width}x${result.height}px, ${kb(result.bytes)}). ` +
            'Compare future renders against it with action "diff_against_baseline"' +
            `${result.fullPage ? " and fullPage: true" : ""}.`,
        ),
      ],
    };
  }

  const { variancePct, diffPixels, totalPixels, baselineSize, currentSize } =
    result;
  const similarity = (100 - variancePct).toFixed(3);
  const dimensionDrift =
    baselineSize.width !== currentSize.width ||
    baselineSize.height !== currentSize.height;

  const verdict =
    variancePct === 0
      ? "IDENTICAL — no visual change."
      : variancePct < 0.1
        ? "NEAR-IDENTICAL — sub-0.1% drift, likely anti-aliasing or text rendering noise."
        : variancePct < 1
          ? "MINOR DRIFT — small localized changes."
          : variancePct < 5
            ? "MODERATE DRIFT — visible layout or content changes."
            : "MAJOR DRIFT — the page has changed substantially against this baseline.";

  const lines = [
    `${result.fullPage ? "Full-page baseline" : "Baseline"} comparison for "${name}" (${result.file}):`,
    `  Variance score: ${variancePct}% of pixels changed ` +
      `(${diffPixels.toLocaleString()} of ${totalPixels.toLocaleString()} px)`,
    `  Structural similarity: ${similarity}%`,
    `  Verdict: ${verdict}`,
  ];
  if (dimensionDrift) {
    lines.push(
      `  DIMENSION DRIFT: baseline is ${baselineSize.width}x${baselineSize.height}px ` +
        `but the current render is ${currentSize.width}x${currentSize.height}px — ` +
        "out-of-bounds regions are compared against white.",
    );
  }
  lines.push(
    "  Delta overlay below: unchanged pixels are faded grayscale, changed pixels are red.",
  );
  if (savedDiff) {
    lines.push(`  diff overlay saved → ${savedDiff.file}`);
  }

  return {
    content: [textBlock(lines.join("\n")), imageBlock(result.diffImage)],
  };
}
