import type { ContrastVerdict, ElementMeasurement } from "../types/measurement.js";

/** Result union of the in-page element measurement. */
export type MeasureOutcome =
  | { found: false; reason: "no-match" | "invalid-selector" }
  | { found: true; measurement: ElementMeasurement };

/**
 * Runs inside the page (must be self-contained — no outer-scope captures).
 * Extracts one element's live rendering spec via getComputedStyle() and
 * getBoundingClientRect(): dimensions, typography, spacing shorthands,
 * effective (ancestor-composited) colors, and a WCAG 2.x contrast ratio
 * with AA (4.5:1) / AAA (7:1) verdicts, including the large-text relaxation
 * (>=24px, or >=18.66px at weight >=700: AA 3:1, AAA 4.5:1).
 */
export function measureElementInPage(selector: string): MeasureOutcome {
  let el: Element | null = null;
  try {
    el = document.querySelector(selector);
  } catch {
    return { found: false, reason: "invalid-selector" };
  }
  if (!el) {
    return { found: false, reason: "no-match" };
  }

  // -- compact addressable-selector + label helpers (mirrors the scanner) --
  function cssEscape(value: string): string {
    return window.CSS && CSS.escape
      ? CSS.escape(value)
      : value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
  }
  function idIsUnique(id: string): boolean {
    try {
      return document.querySelectorAll(`#${cssEscape(id)}`).length === 1;
    } catch {
      return false;
    }
  }
  function nthOfType(node: Element): number {
    let n = 1;
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === node.tagName) {
        n++;
      }
      sibling = sibling.previousElementSibling;
    }
    return n;
  }
  function readableClasses(node: Element): string {
    const classes = Array.from(node.classList)
      .filter((c) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c))
      .slice(0, 2);
    return classes.length > 0 ? `.${classes.join(".")}` : "";
  }
  function uniqueSelectorOf(node: Element): string {
    if (node.id && idIsUnique(node.id)) {
      return `${node.tagName.toLowerCase()}#${cssEscape(node.id)}`;
    }
    const segments: string[] = [];
    let anchor = "body";
    let cursor: Element | null = node;
    while (
      cursor &&
      cursor !== document.body &&
      cursor !== document.documentElement
    ) {
      if (cursor !== node && cursor.id && idIsUnique(cursor.id)) {
        anchor = `${cursor.tagName.toLowerCase()}#${cssEscape(cursor.id)}`;
        break;
      }
      segments.unshift(
        `${cursor.tagName.toLowerCase()}${readableClasses(cursor)}` +
          `:nth-of-type(${nthOfType(cursor)})`,
      );
      cursor = cursor.parentElement;
    }
    return segments.length > 0 ? `${anchor} > ${segments.join(" > ")}` : anchor;
  }
  function labelOf(node: Element): string {
    const aria = node.getAttribute("aria-label");
    if (aria && aria.trim()) {
      return aria.trim().slice(0, 30);
    }
    const testId = node.getAttribute("data-testid");
    if (testId && testId.trim()) {
      return testId.trim().slice(0, 30);
    }
    if (node.id) {
      return node.id.slice(0, 30);
    }
    const own = (node.textContent ?? "").trim().replace(/\s+/g, " ");
    return own.slice(0, 30);
  }

  // -- color parsing, compositing, and WCAG luminance math ------------------
  type Rgba = [number, number, number, number];
  function parseColor(value: string): Rgba | null {
    const m = value.match(
      /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/,
    );
    if (!m) {
      return null;
    }
    return [
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      m[4] === undefined ? 1 : Number(m[4]),
    ];
  }
  function compositeOver(
    top: Rgba,
    bottom: [number, number, number],
  ): [number, number, number] {
    const a = top[3];
    return [
      top[0] * a + bottom[0] * (1 - a),
      top[1] * a + bottom[1] * (1 - a),
      top[2] * a + bottom[2] * (1 - a),
    ];
  }
  function relativeLuminance(rgb: [number, number, number]): number {
    const lin = rgb.map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }) as [number, number, number];
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  // Effective background: stack every painted background-color from the
  // element upward until an opaque one, then composite onto white. If any
  // layer on the way paints a GRADIENT background-image, solid-color math
  // below it is unreliable — gradients draw OVER background-color, and
  // getComputedStyle().backgroundColor alone would report transparent (or
  // an ancestor fill), yielding false contrast verdicts.
  const layers: Rgba[] = [];
  let backgroundSource = "default (white)";
  let gradient: string | null = null;
  let cursor: Element | null = el;
  while (cursor) {
    const cursorStyle = getComputedStyle(cursor);
    const backgroundImage = cursorStyle.backgroundImage;
    if (
      backgroundImage &&
      backgroundImage !== "none" &&
      backgroundImage.includes("gradient(")
    ) {
      gradient = backgroundImage;
      backgroundSource =
        cursor === el
          ? "self (gradient)"
          : `${cursor.tagName.toLowerCase()}${cursor.id ? `#${cursor.id}` : ""} (gradient)`;
      break;
    }
    const parsed = parseColor(cursorStyle.backgroundColor);
    if (parsed && parsed[3] > 0) {
      if (layers.length === 0) {
        backgroundSource =
          cursor === el
            ? "self"
            : `${cursor.tagName.toLowerCase()}${cursor.id ? `#${cursor.id}` : ""}`;
      }
      layers.push(parsed);
      if (parsed[3] >= 1) {
        break;
      }
    }
    cursor = cursor.parentElement;
  }
  let background: [number, number, number] = [255, 255, 255];
  for (let i = layers.length - 1; i >= 0; i--) {
    background = compositeOver(layers[i]!, background);
  }

  // Foreground, composited onto the effective background if translucent
  // (over white as an approximation when the background is a gradient).
  const fgRaw = parseColor(style.color) ?? ([0, 0, 0, 1] as Rgba);
  const foreground =
    fgRaw[3] >= 1
      ? ([fgRaw[0], fgRaw[1], fgRaw[2]] as [number, number, number])
      : compositeOver(fgRaw, background);

  function contrastRatio(
    a: [number, number, number],
    b: [number, number, number],
  ): number {
    const lumA = relativeLuminance(a);
    const lumB = relativeLuminance(b);
    return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
  }

  const fontSizePx = parseFloat(style.fontSize) || 16;
  const fontWeightNum = parseFloat(style.fontWeight) || 400;
  const isLargeText =
    fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeightNum >= 700);

  function shorthand(
    top: string,
    right: string,
    bottom: string,
    left: string,
  ): string {
    if (top === right && right === bottom && bottom === left) {
      return top;
    }
    if (top === bottom && right === left) {
      return `${top} ${right}`;
    }
    if (right === left) {
      return `${top} ${right} ${bottom}`;
    }
    return `${top} ${right} ${bottom} ${left}`;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const rgbString = (rgb: [number, number, number]) =>
    `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`;

  // Contrast verdict: solid math normally; for gradients, parse the color
  // stops out of the computed gradient string (Chromium serializes them as
  // rgb()/rgba()) and report the worst/best ratio across stops — or an
  // honest "cannot verify" when no stops can be extracted.
  let contrast: ContrastVerdict;
  let backgroundColorOut: string;
  if (gradient !== null) {
    backgroundColorOut =
      gradient.length > 100 ? `${gradient.slice(0, 97)}...` : gradient;
    const stopStrings = gradient.match(/rgba?\([^)]*\)/g) ?? [];
    const stops: Rgba[] = [];
    for (const stopString of stopStrings) {
      const parsed = parseColor(stopString);
      if (parsed) {
        stops.push(parsed);
      }
    }
    if (stops.length === 0) {
      contrast = { kind: "gradient-unverifiable", gradient };
    } else {
      const ratios = stops.map((stop) => {
        const solidStop =
          stop[3] >= 1
            ? ([stop[0], stop[1], stop[2]] as [number, number, number])
            : compositeOver(stop, [255, 255, 255]);
        const fgOverStop =
          fgRaw[3] >= 1 ? foreground : compositeOver(fgRaw, solidStop);
        return contrastRatio(fgOverStop, solidStop);
      });
      const worst = Math.min(...ratios);
      const best = Math.max(...ratios);
      contrast = {
        kind: "gradient-range",
        gradient,
        stopCount: stops.length,
        worstRatio: round(worst),
        bestRatio: round(best),
        isLargeText,
        passesAA: worst >= 4.5,
        passesAAA: worst >= 7,
        largeAA: worst >= 3,
        largeAAA: worst >= 4.5,
      };
    }
  } else {
    backgroundColorOut = rgbString(background);
    const ratio = contrastRatio(foreground, background);
    contrast = {
      kind: "solid",
      ratio: round(ratio),
      passesAA: ratio >= 4.5,
      passesAAA: ratio >= 7,
      isLargeText,
      largeAA: ratio >= 3,
      largeAAA: ratio >= 4.5,
    };
  }

  const visible =
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) !== 0 &&
    rect.width > 0 &&
    rect.height > 0;

  return {
    found: true,
    measurement: {
      uniqueSelector: uniqueSelectorOf(el),
      label: labelOf(el),
      rect: {
        x: round(rect.left + window.scrollX),
        y: round(rect.top + window.scrollY),
        width: round(rect.width),
        height: round(rect.height),
      },
      visible,
      display: style.display,
      position: style.position,
      typography: {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
      },
      spacing: {
        padding: shorthand(
          style.paddingTop,
          style.paddingRight,
          style.paddingBottom,
          style.paddingLeft,
        ),
        margin: shorthand(
          style.marginTop,
          style.marginRight,
          style.marginBottom,
          style.marginLeft,
        ),
      },
      colors: {
        color: rgbString(foreground),
        backgroundColor: backgroundColorOut,
        backgroundSource,
      },
      contrast,
      hasText: ((el.textContent ?? "").trim().length > 0),
    },
  };
}
