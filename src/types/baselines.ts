/**
 * Visual baselines: save/diff actions, the pixelmatch threshold, and the
 * set/diff result shapes.
 */

import type { EncodedImage } from "./images.js";
import type { ViewportSize } from "./viewports.js";

/** Directory (relative to cwd) where visual baselines are stored. */
export const BASELINE_DIR = ".agent-eyes/baselines";

export const BASELINE_ACTIONS = ["set_baseline", "diff_against_baseline"] as const;

export type BaselineAction = (typeof BASELINE_ACTIONS)[number];

/** pixelmatch per-pixel color distance threshold (0-1, lower = stricter). */
export const DIFF_THRESHOLD = 0.1;

export interface BaselineSetResult {
  action: "set_baseline";
  /** Absolute path the baseline PNG was written to. */
  file: string;
  /** True when this baseline captures the entire scrollable height. */
  fullPage: boolean;
  width: number;
  height: number;
  bytes: number;
}

export interface BaselineDiffResult {
  action: "diff_against_baseline";
  file: string;
  /** True when baseline and candidate cover the entire scrollable height. */
  fullPage: boolean;
  /** Pixels that differ beyond the threshold. */
  diffPixels: number;
  totalPixels: number;
  /** 0-100, percentage of pixels that changed. */
  variancePct: number;
  baselineSize: ViewportSize;
  currentSize: ViewportSize;
  /** Red-on-faded-grayscale delta overlay, lossy-encoded to save tokens. */
  diffImage: EncodedImage;
}

export type BaselineResult = BaselineSetResult | BaselineDiffResult;
