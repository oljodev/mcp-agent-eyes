/**
 * Layout diagnostics: overflow/overlap/clip/tap-target findings and the raw
 * scan shape returned by the in-page layout payload.
 */

import type { SavedShot } from "./persistence.js";
import type { ViewportName, ViewportSize } from "./viewports.js";

/** An element extending past the viewport's horizontal bounds. */
export interface OverflowOffender {
  /** Unique, addressable selector (anchored at the nearest stable id). */
  selector: string;
  /** Human-readable label (aria-label / data-testid / id / heading text). */
  label: string;
  /** Border-box geometry in CSS pixels relative to the document. */
  left: number;
  right: number;
  width: number;
  /** How far the element extends past the viewport edge, in CSS pixels. */
  overflowPx: number;
}

/** Two structural elements whose bounding boxes destructively intersect. */
export interface OverlapPair {
  selectorA: string;
  labelA: string;
  selectorB: string;
  labelB: string;
  rectA: { left: number; top: number; width: number; height: number };
  rectB: { left: number; top: number; width: number; height: number };
  /** Size of the intersection, in CSS pixels. */
  overlapX: number;
  overlapY: number;
}

/** A container whose children spill or clip past its bounding box. */
export interface ContainerOverflow {
  selector: string;
  label: string;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  /** "clips" when overflow is hidden/clip; "spills" when visible. */
  mode: "clips" | "spills";
  /** Axis (or axes) on which content exceeds the container. */
  axis: "horizontal" | "vertical" | "both";
}

/** A typographic element whose text is silently cut off. */
export interface TextClip {
  selector: string;
  label: string;
  /** First characters of the affected text. */
  textSnippet: string;
  clientWidth: number;
  scrollWidth: number;
  /** Pixels of text hidden past the visible box. */
  hiddenPx: number;
}

/** An interactive element smaller than the minimum mobile tap area. */
export interface TapTargetViolation {
  selector: string;
  label: string;
  width: number;
  height: number;
}

/** Minimum tap-target edge, in CSS pixels (Apple HIG / WCAG 2.5.5-ish). */
export const MIN_TAP_TARGET_PX = 44;

/** Raw scan data returned by the in-page layout payload. */
export interface LayoutScan {
  documentWidth: number;
  documentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Horizontal page scroll distance (0 = no horizontal scrolling). */
  pageOverflowPx: number;
  offenders: OverflowOffender[];
  overlaps: OverlapPair[];
  containerIssues: ContainerOverflow[];
  textClips: TextClip[];
  /** Only populated when the scan ran with tap-target checking (mobile). */
  tapTargetViolations: TapTargetViolation[];
  tapTargetsChecked: boolean;
  elementsScanned: number;
  structuralElementsChecked: number;
  /** True when the scan hit its element caps and may be incomplete. */
  truncated: boolean;
  /** Findings dropped because they matched (or sat inside) an ignoreSelector. */
  suppressedByIgnore: number;
}

/** One viewport's scan within a detect_layout_matrix result. */
export interface LayoutMatrixEntry {
  viewport: ViewportName;
  size: ViewportSize;
  scan: LayoutScan;
  /** The saved red-outline overlay render, when annotation ran. */
  annotatedShot?: SavedShot | null;
}
