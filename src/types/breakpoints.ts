/**
 * Responsive breakpoint-sweep types: one sample per probed width, collapsed
 * into contiguous health/overflow bands.
 */

/** A single overflow probe at one viewport width. */
export interface WidthSample {
  width: number;
  /** Document-level horizontal scroll extent in CSS px (0 = healthy). */
  overflowPx: number;
  /** How far the worst single element bleeds past the edge (its own overflow). */
  elementOverflowPx: number;
  /** The outermost element bleeding past the viewport, if any. */
  selector: string | null;
  label: string | null;
}

/** A contiguous range of widths sharing the same layout health signature. */
export interface BreakpointBand {
  minWidth: number;
  maxWidth: number;
  status: "healthy" | "overflow";
  /** Worst bleed of the named element within the band, in CSS px. */
  maxElementOverflowPx: number;
  /** Worst document-level horizontal scroll extent within the band, in CSS px. */
  maxDocOverflowPx: number;
  /** Representative offending selector (overflow bands only). */
  selector: string | null;
  label: string | null;
}

/** Result of a find_breakpoints sweep. */
export interface BreakpointSweep {
  minWidth: number;
  maxWidth: number;
  step: number;
  /** Number of distinct widths probed. */
  samples: number;
  height: number;
  bands: BreakpointBand[];
}
