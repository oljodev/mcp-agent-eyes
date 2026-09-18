/** review_design and extract_design_tokens text formatting. */

import type { DesignReview, SiteDesign, StyleTokens } from "../../types/design.js";
import type { ViewportName } from "../../types/viewports.js";
import { viewportLabel } from "../blocks.js";

/** Render a design review: the measured system inventory + flagged smells. */
export function formatDesignReview(
  review: DesignReview,
  url: string,
  viewport: ViewportName,
): string {
  const lines: string[] = [
    `DESIGN REVIEW — ${url} @ ${viewportLabel(viewport)}`,
    `Scanned ${review.elementsScanned} visible element(s)${review.truncated ? " (capped)" : ""}.`,
    "",
    "DESIGN SYSTEM (measured):",
    `  Text colors:   ${review.textColors.length}`,
    `  Backgrounds:   ${review.bgColors.length}`,
    `  Font sizes:    ${review.fontSizes.length}${review.fontSizes.length ? `  → ${review.fontSizes.join(", ")}px` : ""}`,
    `  Font weights:  ${review.fontWeights.length}${review.fontWeights.length ? `  → ${review.fontWeights.join(", ")}` : ""}`,
    `  Font families: ${review.fontFamilies.length}${review.fontFamilies.length ? `  → ${review.fontFamilies.join(", ")}` : ""}`,
    `  Line heights:  ${review.lineHeights.length}`,
    `  Radii:         ${review.radii.length}${review.radii.length ? `  → ${review.radii.join(", ")}px` : ""}`,
    `  Shadows:       ${review.shadowCount}`,
    `  Spacing:       ${review.spacing.length} value(s)${review.offGridSpacing.length ? `, ${review.offGridSpacing.length} off the grid (${review.offGridSpacing.slice(0, 8).join(", ")}px)` : ""}`,
  ];
  if (review.smells.length === 0) {
    lines.push(
      "",
      "[OK] No major design smells — a consistent, disciplined system.",
    );
  } else {
    lines.push("", `DESIGN SMELLS (${review.smells.length}):`);
    for (const s of review.smells) {
      lines.push(
        `  [${s.kind}] ${s.detail}${s.selector ? ` — ${s.selector}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

/** Convert an rgb()/rgba() string to #rrggbb (noting alpha when < 1). */
function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m || !m[1]) return rgb;
  const p = m[1].split(",").map((x) => parseFloat(x));
  if (p.length < 3) return rgb;
  const h = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  const hex = `#${h(p[0] ?? 0)}${h(p[1] ?? 0)}${h(p[2] ?? 0)}`;
  return p[3] !== undefined && p[3] < 1
    ? `${hex} (${Math.round(p[3] * 100)}% opacity)`
    : hex;
}

/** Render extracted style tokens: inferred roles + fonts-by-role + IA + CSS/Tailwind. */
export function formatStyleTokens(
  tokens: StyleTokens,
  url: string,
  viewport: ViewportName,
  savedPath: string | null,
): string {
  const bg = tokens.background.map(rgbToHex);
  const text = tokens.text.map(rgbToHex);
  const accentHex = tokens.accent ? rgbToHex(tokens.accent) : null;
  const borderHex = tokens.border ? rgbToHex(tokens.border) : null;
  const lines: string[] = [`STYLE TOKENS — ${url} @ ${viewportLabel(viewport)}`];
  if (savedPath) lines.push(`saved → ${savedPath}`);

  lines.push(
    "",
    "COLOR ROLES:",
    `  Page background: ${bg[0] ?? "—"}`,
    `  Surface(s):      ${bg.slice(1).join(", ") || "—"}`,
    `  Body text:       ${text[0] ?? "—"}`,
    `  Other text:      ${text.slice(1).join(", ") || "—"}`,
    `  Border:          ${borderHex ?? "—"}`,
    `  Accent:          ${accentHex ?? "— (none clearly saturated)"}`,
  );
  if (tokens.accentGradient) lines.push(`  Accent gradient: ${tokens.accentGradient}`);

  // Fonts BY ROLE — the key fidelity signal.
  lines.push(
    "",
    "FONTS:",
    `  Display/headings: ${tokens.fontDisplay ?? "(same as body)"}`,
    `  Body:             ${tokens.fontPrimary ?? "—"}`,
    `  Mono:             ${tokens.fontMono ?? "—"}`,
  );
  if (tokens.webfontLinks && tokens.webfontLinks.length) {
    lines.push(`  Webfont link(s):  ${tokens.webfontLinks.join("  ")}`);
  }
  if (tokens.loadedFonts && tokens.loadedFonts.length) {
    lines.push(`  Loaded families:  ${tokens.loadedFonts.join(", ")}`);
  }

  if (tokens.typeRamp && tokens.typeRamp.length) {
    lines.push("", "TYPE RAMP:");
    for (const t of tokens.typeRamp) {
      lines.push(
        `  ${t.role.padEnd(8)} ${t.px}px / ${t.weight} / lh ${t.lineHeight}` +
          `${t.letterSpacing !== "normal" ? ` / ls ${t.letterSpacing}` : ""}` +
          `${t.transform !== "none" ? ` / ${t.transform}` : ""}`,
      );
    }
  } else {
    lines.push("", `Type scale: ${tokens.typeScale.join(", ") || "—"}px`);
  }

  lines.push(
    "",
    "SYSTEM:",
    `  Spacing: base ${tokens.spacingBase}px; scale ${tokens.spacingScale.join(", ") || "—"}px`,
    `  Radii:   ${tokens.radii.join(", ") || "—"}px`,
    `  Shadows: ${tokens.shadows.length} style(s)`,
  );

  if (tokens.media && tokens.media.length) {
    const byRole = new Map<string, number>();
    for (const m of tokens.media) byRole.set(m.role, (byRole.get(m.role) ?? 0) + 1);
    lines.push(
      "  Imagery: " +
        [...byRole.entries()].map(([r, n]) => `${n} ${r}`).join(", ") +
        " (slots only — fill with your own assets)",
    );
  }

  if (tokens.sections && tokens.sections.length) {
    lines.push("", "PAGE STRUCTURE (information architecture):");
    tokens.sections.forEach((s, i) => {
      const meta =
        s.itemCount > 0 ? ` ×${s.itemCount}${s.columns > 1 ? ` (${s.columns} col)` : ""}` : "";
      const head = s.heading ? ` — "${s.heading}"` : "";
      lines.push(`  ${i + 1}. ${s.type}${meta}${head}`);
    });
  }

  // CSS variables — directly pasteable into :root.
  const css: string[] = ["", "CSS VARIABLES (paste into :root):", ":root {"];
  if (bg[0]) css.push(`  --bg: ${bg[0]};`);
  if (bg[1]) css.push(`  --surface: ${bg[1]};`);
  if (text[0]) css.push(`  --text: ${text[0]};`);
  if (text[1]) css.push(`  --text-muted: ${text[1]};`);
  if (borderHex) css.push(`  --border: ${borderHex.split(" ")[0]};`);
  if (tokens.accentGradient) css.push(`  --accent: ${tokens.accentGradient};`);
  else if (accentHex) css.push(`  --accent: ${accentHex.split(" ")[0]};`);
  if (tokens.fontDisplay) css.push(`  --font-display: "${tokens.fontDisplay}";`);
  if (tokens.fontPrimary) css.push(`  --font-body: "${tokens.fontPrimary}";`);
  if (tokens.fontMono) css.push(`  --font-mono: "${tokens.fontMono}";`);
  if (tokens.bodySize) css.push(`  --text-base: ${tokens.bodySize}px;`);
  const baseRadius = tokens.radii.find((r) => r > 0 && r < 9999);
  if (baseRadius) css.push(`  --radius: ${baseRadius}px;`);
  if (tokens.radii.includes(9999)) css.push(`  --radius-pill: 9999px;`);
  if (tokens.shadows[0]) css.push(`  --shadow: ${tokens.shadows[0]};`);
  css.push("}");

  // Tailwind theme.extend snippet — what the agent actually builds with.
  const tw: string[] = ["", "TAILWIND theme.extend:", "{"];
  tw.push("  fontFamily: {");
  if (tokens.fontDisplay) tw.push(`    display: ["${tokens.fontDisplay}", "serif"],`);
  if (tokens.fontPrimary) tw.push(`    sans: ["${tokens.fontPrimary}", "system-ui", "sans-serif"],`);
  if (tokens.fontMono) tw.push(`    mono: ["${tokens.fontMono}", "monospace"],`);
  tw.push("  },");
  tw.push("  colors: {");
  if (bg[0]) tw.push(`    bg: "${bg[0]}",`);
  if (bg[1]) tw.push(`    surface: "${bg[1]}",`);
  if (text[0]) tw.push(`    ink: "${text[0]}",`);
  if (accentHex) tw.push(`    accent: "${accentHex.split(" ")[0]}",`);
  tw.push("  },");
  if (baseRadius) tw.push(`  borderRadius: { DEFAULT: "${baseRadius}px" },`);
  tw.push("}");

  return [...lines, ...css, ...tw].join("\n");
}

/** Render a whole-site design brief: per-page IA + the merged design system. */
export function formatSiteDesign(
  site: SiteDesign,
  savedPath: string | null,
): string {
  const lines: string[] = [
    `SITE DESIGN — ${site.origin}`,
    `Crawled ${site.pagesCrawled.length} page(s): ${site.pagesCrawled.join(", ")}` +
      (site.pagesSkipped.length
        ? `  (skipped: ${site.pagesSkipped.join(", ")})`
        : ""),
  ];
  if (savedPath) lines.push(`saved → ${savedPath}`);

  lines.push("", "PER-PAGE STRUCTURE (information architecture):");
  for (const pg of site.pages) {
    lines.push(`  ${pg.path}${pg.title ? `  — ${pg.title}` : ""}`);
    for (const s of pg.sections) {
      const meta =
        s.itemCount > 0
          ? ` ×${s.itemCount}${s.columns > 1 ? ` (${s.columns} col)` : ""}`
          : "";
      lines.push(`      · ${s.type}${meta}${s.heading ? ` — "${s.heading}"` : ""}`);
    }
  }

  // Reuse the single-page token brief for the merged design system.
  const tokenBrief = formatStyleTokens(site.tokens, site.origin, "desktop", null)
    .split("\n")
    .slice(1) // drop its own header line
    .join("\n");
  lines.push("", "—— MERGED DESIGN SYSTEM (build everything with this) ——", tokenBrief);

  lines.push(
    "",
    "NOTE: this is DESIGN + STRUCTURE only. Fill all copy, images, and logos " +
      "with the client's own content — never the reference site's.",
  );
  return lines.join("\n");
}
