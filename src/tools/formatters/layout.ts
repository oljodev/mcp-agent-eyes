/** Layout-report formatting shared by detect_layout_matrix and interact tools. */

import { countLayoutIssues } from "../../browser/layout-scan.js";
import type { LayoutScan } from "../../types/layout.js";
import { MIN_TAP_TARGET_PX } from "../../types/layout.js";
import type { ViewportName } from "../../types/viewports.js";
import { viewportLabel } from "../blocks.js";

/** `selector "label"` — the addressable handle findings are reported by. */
export function handle(selector: string, label: string): string {
  return label ? `${selector} "${label}"` : selector;
}

/** The per-viewport body of a layout report (shared by both layout tools). */
export function formatScanSections(scan: LayoutScan): string[] {
  const lines: string[] = [];

  // 1. viewport overflow
  if (scan.pageOverflowPx > 0) {
    lines.push(
      `  [ISSUE] HORIZONTAL PAGE OVERFLOW: the document is ${scan.documentWidth}px wide — ` +
        `${scan.pageOverflowPx}px wider than the ${scan.viewportWidth}px viewport, ` +
        "so the page scrolls horizontally.",
    );
    if (scan.offenders.length > 0) {
      lines.push("    Out-of-bounds elements (outermost offenders):");
      for (const o of scan.offenders) {
        const direction = o.left < 0 ? "left" : "right";
        lines.push(
          `      - ${handle(o.selector, o.label)} — left=${o.left}px right=${o.right}px ` +
            `width=${o.width}px → extends ${o.overflowPx}px past the ${direction} viewport edge`,
        );
      }
    } else {
      lines.push(
        "    (No single offending element found — overflow may come from " +
          "margins, transforms, or pseudo-elements.)",
      );
    }
  } else {
    lines.push(
      `  [OK] No horizontal page overflow (document fits the ${scan.viewportWidth}px viewport).`,
    );
  }

  // 2. container overflow
  if (scan.containerIssues.length > 0) {
    lines.push(
      `  [ISSUE] CONTAINER OVERFLOW: ${scan.containerIssues.length} container(s) ` +
        "whose content exceeds their box:",
    );
    for (const c of scan.containerIssues) {
      lines.push(
        `      - ${handle(c.selector, c.label)} ${c.mode === "clips" ? "CLIPS" : "SPILLS"} ` +
          `its content on the ${c.axis} axis — box ${c.clientWidth}x${c.clientHeight}px, ` +
          `content ${c.scrollWidth}x${c.scrollHeight}px`,
      );
    }
  } else {
    lines.push("  [OK] No containers clip or spill their content.");
  }

  // 3. text truncation
  if (scan.textClips.length > 0) {
    lines.push(
      `  [ISSUE] TEXT CLIPPING: ${scan.textClips.length} element(s) silently ` +
        "cut off text:",
    );
    for (const t of scan.textClips) {
      lines.push(
        `      - ${handle(t.selector, t.label)} hides ${t.hiddenPx}px of text ` +
          `(box ${t.clientWidth}px, text needs ${t.scrollWidth}px): "${t.textSnippet}..."`,
      );
    }
  } else {
    lines.push("  [OK] No silently clipped or truncated text.");
  }

  // 4. overlaps
  if (scan.overlaps.length > 0) {
    lines.push(
      `  [ISSUE] ELEMENT COLLISIONS: ${scan.overlaps.length} destructive ` +
        "bounding-box intersection(s):",
    );
    for (const o of scan.overlaps) {
      lines.push(
        `      - ${handle(o.selectorA, o.labelA)} overlaps ${handle(o.selectorB, o.labelB)} ` +
          `by ${o.overlapX}px horizontally / ${o.overlapY}px vertically`,
        `          A at (${o.rectA.left},${o.rectA.top}) ${o.rectA.width}x${o.rectA.height}px; ` +
          `B at (${o.rectB.left},${o.rectB.top}) ${o.rectB.width}x${o.rectB.height}px`,
      );
    }
  } else {
    lines.push(
      `  [OK] No destructive overlaps among ${scan.structuralElementsChecked} structural elements.`,
    );
  }

  // 5. tap targets (mobile only)
  if (scan.tapTargetsChecked) {
    if (scan.tapTargetViolations.length > 0) {
      lines.push(
        `  [ISSUE] TAP TARGETS: ${scan.tapTargetViolations.length} interactive ` +
          `element(s) smaller than ${MIN_TAP_TARGET_PX}x${MIN_TAP_TARGET_PX}px:`,
      );
      for (const t of scan.tapTargetViolations) {
        lines.push(
          `      - ${handle(t.selector, t.label)} is ${t.width}x${t.height}px`,
        );
      }
    } else {
      lines.push(
        `  [OK] All interactive elements meet the ${MIN_TAP_TARGET_PX}px tap-target minimum.`,
      );
    }
  }

  if (scan.suppressedByIgnore > 0) {
    lines.push(
      `  (${scan.suppressedByIgnore} issue(s) suppressed by ignoreSelector.)`,
    );
  }

  if (scan.truncated) {
    lines.push(
      "  Note: the page exceeds scan caps; very large DOMs are sampled — " +
        "issues beyond the caps may exist.",
    );
  }

  return lines;
}

export function formatSingleScan(
  scan: LayoutScan,
  url: string,
  viewport: ViewportName | null,
): string {
  const heading = viewport
    ? `LAYOUT AUDIT — ${url} @ ${viewportLabel(viewport)}`
    : `LAYOUT AUDIT — ${url} @ ${scan.viewportWidth}x${scan.viewportHeight}`;
  return [
    heading,
    `Document: ${scan.documentWidth}x${scan.documentHeight}px. ` +
      `Scanned ${scan.elementsScanned} elements. ` +
      `${countLayoutIssues(scan)} issue(s) found.`,
    ...formatScanSections(scan),
  ].join("\n");
}
