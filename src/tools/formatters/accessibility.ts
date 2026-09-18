/** scan_accessibility grouped text report. */

import type { AccessibilityScan } from "../../types/accessibility.js";
import type { ViewportName } from "../../types/viewports.js";
import { viewportLabel } from "../blocks.js";

export function formatAccessibilityReport(
  scan: AccessibilityScan,
  url: string,
  viewport: ViewportName,
): string {
  const total =
    scan.imageIssues.length + scan.headingIssues.length + scan.nameIssues.length;
  const lines = [
    `ACCESSIBILITY SCAN — ${url} @ ${viewportLabel(viewport)}`,
    `Checked ${scan.imagesChecked} image(s), ${scan.headingsChecked} heading(s), ` +
      `${scan.controlsChecked} interactive control(s). ${total} issue(s) found.`,
    "",
  ];

  if (scan.imageIssues.length > 0) {
    lines.push(`[ISSUE] IMAGE ALTERNATES (${scan.imageIssues.length}):`);
    for (const issue of scan.imageIssues) {
      const src = issue.src ? ` (src: ${issue.src})` : "";
      lines.push(
        issue.kind === "missing-alt"
          ? `  - ${issue.selector} — <img> has no alt attribute${src}`
          : `  - ${issue.selector} — empty alt without role="presentation": ` +
              `confirm the image is decorative or provide alt text${src}`,
      );
    }
  } else {
    lines.push(
      `[OK] All ${scan.imagesChecked} image(s) carry alternate text or are declared decorative.`,
    );
  }

  if (scan.headingIssues.length > 0) {
    lines.push(`[ISSUE] HEADING HIERARCHY (${scan.headingIssues.length}):`);
    for (const issue of scan.headingIssues) {
      lines.push(
        issue.kind === "starts-too-deep"
          ? `  - ${issue.selector} "${issue.text}" — the document's first ` +
              `heading is an h${issue.level}; sections should start at h1/h2`
          : `  - ${issue.selector} "${issue.text}" — h${issue.level} follows ` +
              `an h${issue.previousLevel}, skipping h${issue.previousLevel + 1}`,
      );
    }
  } else {
    lines.push(
      `[OK] Heading levels are sequential (${scan.headingsChecked} heading(s)).`,
    );
  }
  if (!scan.hasH1) {
    lines.push("[NOTE] The document contains no <h1>.");
  }

  if (scan.nameIssues.length > 0) {
    lines.push(
      `[ISSUE] CONTROLS WITHOUT ACCESSIBLE NAMES (${scan.nameIssues.length}):`,
    );
    for (const issue of scan.nameIssues) {
      const what = issue.typeAttr
        ? `${issue.tag}[type=${issue.typeAttr}]`
        : issue.tag;
      lines.push(
        `  - ${issue.selector} (${what}) — no label, aria-label, or ` +
          `aria-labelledby${issue.hint ? `; ${issue.hint}` : ""}`,
      );
    }
  } else {
    lines.push(
      `[OK] All ${scan.controlsChecked} visible control(s) expose an accessible name.`,
    );
  }

  if (scan.truncated) {
    lines.push(
      "",
      "Note: scan caps reached — more issues may exist beyond those reported.",
    );
  }
  return lines.join("\n");
}
