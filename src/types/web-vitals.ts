/** Cumulative Layout Shift (CLS) diagnostic types. */

/** WCAG-style banding of a CLS score (Core Web Vitals thresholds). */
export type CLSBand = "good" | "needs-improvement" | "poor";

/** One element implicated in layout shifts, with its summed attributed score. */
export interface LayoutShiftOffender {
  selector: string;
  label: string;
  /** Sum of the shift scores this element participated in. */
  value: number;
}

/** Result of a measure_layout_shift observation window. */
export interface LayoutShiftResult {
  /** Aggregate CLS = sum of all unexpected layout-shift scores. */
  cls: number;
  band: CLSBand;
  /** Number of distinct layout-shift entries observed. */
  shiftCount: number;
  offenders: LayoutShiftOffender[];
  /** False when the observer never armed (e.g. blocked) — cls is then unreliable. */
  hadData: boolean;
  /** Observation window in ms the page was watched after load. */
  windowMs: number;
}
