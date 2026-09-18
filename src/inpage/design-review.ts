import type { DesignReview, DesignSmell } from "../types/design.js";

/**
 * In-page (browser context) design analyzer. Walks visible elements, builds an
 * inventory of the design system actually in use (colors, type scale, spacing,
 * radii, shadows), and flags "design smells": sprawl, off-grid spacing,
 * cramped/long/tiny body text, and near-miss alignment. Returns plain data.
 */
export function reviewDesignInPage(limits: {
  fontSizes: number;
  textColors: number;
  bgColors: number;
  fontFamilies: number;
  radii: number;
  spacingGrid: number;
  minBodyLineHeight: number;
  minBodyFontPx: number;
  maxLineLengthCh: number;
  alignNearMissMin: number;
  alignNearMissMax: number;
  maxElements: number;
}): DesignReview {
  const smells: DesignSmell[] = [];
  const empty: DesignReview = {
    elementsScanned: 0,
    truncated: false,
    textColors: [],
    bgColors: [],
    fontSizes: [],
    fontWeights: [],
    fontFamilies: [],
    lineHeights: [],
    radii: [],
    shadowCount: 0,
    spacing: [],
    offGridSpacing: [],
    smells: [],
  };
  if (!document.body) {
    return empty;
  }

  function shortSelector(el: Element): string {
    if (el.id) return `#${el.id}`;
    const parts: string[] = [];
    let cur: Element | null = el;
    let depth = 0;
    while (cur && depth < 3 && cur.tagName.toLowerCase() !== "body") {
      if (cur.id) {
        parts.unshift(`#${cur.id}`);
        break;
      }
      const tag = cur.tagName.toLowerCase();
      const cls = (cur.getAttribute("class") ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      let seg = tag + (cls[0] ? `.${cls[0]}` : "");
      const parent: Element | null = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === cur!.tagName,
        );
        if (siblings.length > 1) {
          seg += `:nth-of-type(${Array.from(parent.children).indexOf(cur) + 1})`;
        }
      }
      parts.unshift(seg);
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(" > ") || el.tagName.toLowerCase();
  }

  const hasDirectText = (el: Element): boolean => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3 && (n.textContent ?? "").trim().length > 0) {
        return true;
      }
    }
    return false;
  };

  const textColorCounts = new Map<string, number>();
  const bg = new Set<string>();
  const sizes = new Map<number, number>();
  const weights = new Set<number>();
  const families = new Set<string>();
  const lineHeights = new Set<number>();
  const radii = new Set<number>();
  const shadows = new Set<string>();
  const spacing = new Set<number>();
  const childLefts = new Map<Element, Array<{ left: number; el: Element }>>();
  const cramped: string[] = [];
  const longLines: string[] = [];
  const tinyBody: string[] = [];

  const SKIP = new Set([
    "script",
    "style",
    "noscript",
    "svg",
    "path",
    "br",
    "head",
    "meta",
    "link",
  ]);
  const all = Array.from(document.body.querySelectorAll("*"));
  const truncated = all.length > limits.maxElements;
  const elements = truncated ? all.slice(0, limits.maxElements) : all;
  let scanned = 0;

  for (const el of elements) {
    if (SKIP.has(el.tagName.toLowerCase())) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      parseFloat(cs.opacity) === 0
    ) {
      continue;
    }
    scanned++;

    const bgc = cs.backgroundColor;
    if (bgc && bgc !== "rgba(0, 0, 0, 0)" && bgc !== "transparent") {
      bg.add(bgc);
    }
    const radius = parseFloat(cs.borderTopLeftRadius);
    if (!Number.isNaN(radius) && radius > 0) radii.add(Math.round(radius));
    if (cs.boxShadow && cs.boxShadow !== "none") shadows.add(cs.boxShadow);

    for (const v of [
      cs.paddingTop,
      cs.paddingRight,
      cs.paddingBottom,
      cs.paddingLeft,
      cs.marginTop,
      cs.marginBottom,
    ]) {
      const px = parseFloat(v);
      if (!Number.isNaN(px) && px > 0) spacing.add(Math.round(px));
    }

    if (hasDirectText(el)) {
      textColorCounts.set(cs.color, (textColorCounts.get(cs.color) ?? 0) + 1);
      const fsPx = parseFloat(cs.fontSize);
      if (!Number.isNaN(fsPx)) {
        const fs = Math.round(fsPx);
        sizes.set(fs, (sizes.get(fs) ?? 0) + 1);
      }
      const fw = parseInt(cs.fontWeight, 10);
      if (!Number.isNaN(fw)) weights.add(fw);
      const fam = (cs.fontFamily.split(",")[0] ?? "")
        .replace(/["']/g, "")
        .trim();
      if (fam) families.add(fam);
      const lhPx = parseFloat(cs.lineHeight);
      const ratio =
        !Number.isNaN(lhPx) && fsPx > 0 ? lhPx / fsPx : Number.NaN;
      if (!Number.isNaN(ratio)) {
        lineHeights.add(Math.round(ratio * 100) / 100);
      }

      const text = (el.textContent ?? "").trim();
      const isBody = fsPx >= 12 && fsPx <= 22 && text.length >= 40;
      if (isBody) {
        if (!Number.isNaN(ratio) && ratio < limits.minBodyLineHeight) {
          if (cramped.length < 3) cramped.push(shortSelector(el));
        }
        const approxChars = rect.width / (0.5 * fsPx);
        if (approxChars > limits.maxLineLengthCh) {
          if (longLines.length < 3) longLines.push(shortSelector(el));
        }
        if (fsPx < limits.minBodyFontPx) {
          if (tinyBody.length < 3) tinyBody.push(shortSelector(el));
        }
      }
    }

    const parent = el.parentElement;
    if (parent) {
      const arr = childLefts.get(parent) ?? [];
      arr.push({ left: Math.round(rect.left), el });
      childLefts.set(parent, arr);
    }
  }

  // --- design-system inventory -> sprawl smells ---
  const fontSizes = [...sizes.keys()].sort((a, b) => a - b);
  const textColors = [...textColorCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
  const offGrid = [...spacing].filter((v) => v % limits.spacingGrid !== 0).sort(
    (a, b) => a - b,
  );

  if (fontSizes.length > limits.fontSizes) {
    smells.push({
      kind: "TYPE SCALE",
      detail: `${fontSizes.length} distinct font sizes (${fontSizes.join(", ")}px) — designed UIs use ~${limits.fontSizes}. Consolidate near-duplicates.`,
    });
  }
  if (textColors.length > limits.textColors) {
    smells.push({
      kind: "COLOR",
      detail: `${textColors.length} distinct text colors — a tighter palette (~${limits.textColors}) reads more premium.`,
    });
  }
  if (bg.size > limits.bgColors) {
    smells.push({
      kind: "COLOR",
      detail: `${bg.size} distinct background colors — consider consolidating.`,
    });
  }
  if (families.size > limits.fontFamilies) {
    smells.push({
      kind: "FONTS",
      detail: `${families.size} font families (${[...families].join(", ")}) — limit to ~${limits.fontFamilies}.`,
    });
  }
  if (radii.size > limits.radii) {
    smells.push({
      kind: "RADIUS",
      detail: `${radii.size} distinct border-radii (${[...radii].sort((a, b) => a - b).join(", ")}px) — a consistent radius language is 1-2.`,
    });
  }
  if (offGrid.length > 0) {
    smells.push({
      kind: "SPACING",
      detail: `${offGrid.length} spacing value(s) off the ${limits.spacingGrid}px grid: ${offGrid.slice(0, 8).join(", ")}px — breaks vertical rhythm.`,
    });
  }

  // --- readability smells (summarized) ---
  if (cramped.length > 0) {
    smells.push({
      kind: "READABILITY",
      detail: `cramped line-height (< ${limits.minBodyLineHeight}) on body text`,
      selector: cramped.join(", "),
    });
  }
  if (longLines.length > 0) {
    smells.push({
      kind: "READABILITY",
      detail: `line length over ~${limits.maxLineLengthCh} chars (hard to read)`,
      selector: longLines.join(", "),
    });
  }
  if (tinyBody.length > 0) {
    smells.push({
      kind: "READABILITY",
      detail: `body text under ${limits.minBodyFontPx}px`,
      selector: tinyBody.join(", "),
    });
  }

  // --- near-miss alignment: a clear shared left edge with a stray child ---
  let alignFindings = 0;
  for (const [, kids] of childLefts) {
    if (alignFindings >= 6 || kids.length < 3) continue;
    const counts = new Map<number, number>();
    for (const k of kids) counts.set(k.left, (counts.get(k.left) ?? 0) + 1);
    let modeLeft = 0;
    let modeCount = 0;
    for (const [left, c] of counts) {
      if (c > modeCount) {
        modeCount = c;
        modeLeft = left;
      }
    }
    if (modeCount < 3) continue; // need a real shared column
    for (const k of kids) {
      const d = Math.abs(k.left - modeLeft);
      if (d >= limits.alignNearMissMin && d <= limits.alignNearMissMax) {
        smells.push({
          kind: "ALIGNMENT",
          detail: `${d}px off the shared left edge (${modeLeft}px) of its siblings — looks misaligned`,
          selector: shortSelector(k.el),
        });
        if (++alignFindings >= 6) break;
      }
    }
  }

  return {
    elementsScanned: scanned,
    truncated,
    textColors: textColors.slice(0, 12),
    bgColors: [...bg],
    fontSizes,
    fontWeights: [...weights].sort((a, b) => a - b),
    fontFamilies: [...families],
    lineHeights: [...lineHeights].sort((a, b) => a - b),
    radii: [...radii].sort((a, b) => a - b),
    shadowCount: shadows.size,
    spacing: [...spacing].sort((a, b) => a - b),
    offGridSpacing: offGrid,
    smells,
  };
}
