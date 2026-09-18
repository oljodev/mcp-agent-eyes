/** label_interactives legend formatting. */

import type { InteractiveMark } from "../../types/marks.js";
import type { ViewportName } from "../../types/viewports.js";
import { viewportLabel } from "../blocks.js";

export function formatMarkLegend(
  marks: InteractiveMark[],
  candidates: number,
  truncated: boolean,
  url: string,
  viewport: ViewportName,
): string {
  const lines = [
    `SET-OF-MARK — ${url} @ ${viewportLabel(viewport)}`,
    `${marks.length} numbered interactive element(s)` +
      `${candidates > marks.length ? ` of ${candidates} found` : ""}` +
      `${truncated ? " (capped — scroll or zoom in for the rest)" : ""}. ` +
      "Each badge in the image maps to a selector below:",
    "",
  ];
  for (const m of marks) {
    const label = m.label ? ` "${m.label}"` : "";
    lines.push(`  [${m.n}] ${m.tag} → ${m.selector}${label}`);
  }
  lines.push(
    "",
    "To act on one, pass its selector to interact_and_audit " +
      '(e.g. action "click", selector from [N]).',
  );
  return lines.join("\n");
}
