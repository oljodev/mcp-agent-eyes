/**
 * Tokenless element inspector: the live computed-style measurement of one
 * element and the WCAG contrast verdict (solid / gradient-range / unverifiable).
 */

/**
 * Live computed-style measurement of one element, extracted in-page via
 * getComputedStyle() + getBoundingClientRect(). Pure text — zero image
 * tokens.
 */
export interface ElementMeasurement {
  /** Unique, addressable selector resolved for the matched element. */
  uniqueSelector: string;
  /** Human-readable label (aria-label / data-testid / id / text). */
  label: string;
  /** Border-box geometry in CSS pixels, document coordinates. */
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
  display: string;
  position: string;
  typography: {
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
  };
  spacing: {
    /** CSS-shorthand-style computed padding, e.g. "10px 24px". */
    padding: string;
    /** CSS-shorthand-style computed margin. */
    margin: string;
  };
  colors: {
    /** Computed foreground color (rgb/rgba), composited if translucent. */
    color: string;
    /**
     * EFFECTIVE background: the element's own background-color, or the
     * nearest ancestor's when transparent, alpha-composited; white when
     * nothing paints. For gradient backgrounds this holds the (truncated)
     * raw gradient string instead of a solid color.
     */
    backgroundColor: string;
    /** Where the effective background came from ("self", an ancestor tag, or "default (white)"). */
    backgroundSource: string;
  };
  /** WCAG contrast verdict between the effective fg/bg pair. */
  contrast: ContrastVerdict;
  /** Whether the element has its own text (contrast is meaningless otherwise). */
  hasText: boolean;
}

/**
 * Contrast result: plain solid-color math, a worst/best range across the
 * parsed color stops of a gradient background, or an honest "cannot verify"
 * when a gradient's stops can't be extracted programmatically.
 */
export type ContrastVerdict =
  | {
      kind: "solid";
      /** e.g. 4.83 (rounded to 2 decimals). */
      ratio: number;
      /** Normal text: >= 4.5. */
      passesAA: boolean;
      /** Normal text: >= 7. */
      passesAAA: boolean;
      /** Large text (>=24px, or >=18.66px bold): >= 3 (AA) / >= 4.5 (AAA). */
      isLargeText: boolean;
      largeAA: boolean;
      largeAAA: boolean;
    }
  | {
      kind: "gradient-range";
      /** Raw computed background-image string. */
      gradient: string;
      /** Color stops successfully parsed out of the gradient. */
      stopCount: number;
      /** Contrast vs the LEAST favorable stop — the safety floor. */
      worstRatio: number;
      bestRatio: number;
      isLargeText: boolean;
      /** Verdicts computed against the worst stop. */
      passesAA: boolean;
      passesAAA: boolean;
      largeAA: boolean;
      largeAAA: boolean;
    }
  | {
      kind: "gradient-unverifiable";
      /** Raw computed background-image string, for visual review. */
      gradient: string;
    };
