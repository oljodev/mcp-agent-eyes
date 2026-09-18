/**
 * Semantic visual-regression types: a pixel-diff clustered into bounding-box
 * regions, each mapped (via hit-testing) to the element underneath it.
 */

import type { ViewportSize } from "./viewports.js";

/** A changed region resolved to the element under its center. */
export interface DiffRegion {
  /** Unique, addressable selector of the element under the region center. */
  selector: string;
  label: string;
  /** Lowercased tag of that element. */
  tag: string;
  /** Bounding box of the changed region, in CSS px (document coordinates). */
  box: { x: number; y: number; width: number; height: number };
  /** Number of changed device pixels attributed to this region. */
  changedPx: number;
}

/** Result of a visual_diff_regions comparison. */
export interface VisualDiffRegionResult {
  tag: string;
  /** Whether the full scrollable height was diffed (vs the viewport fold). */
  fullPage: boolean;
  /** Percentage of pixels that changed vs the baseline. */
  variancePct: number;
  diffPixels: number;
  totalPixels: number;
  baselineSize: ViewportSize;
  currentSize: ViewportSize;
  /** Element-resolved change regions, largest first. */
  regions: DiffRegion[];
  /** Raw clustered regions that could not be mapped to an element. */
  unmappedRegions: number;
  /** Absolute path of the saved human-viewable delta overlay, if written. */
  overlayFile: string | null;
  /** Set when a tall full-page capture was clipped to the model-safe cap. */
  truncatedToPx?: number;
  documentHeightPx?: number;
}
