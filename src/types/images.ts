/**
 * Image rendering: encodings, quality/size controls, and the encoded-image and
 * capture result shapes.
 */

import type { ViewportName, ViewportSize } from "./viewports.js";

/** Encodings a screenshot can be returned in. */
export const IMAGE_FORMATS = ["webp", "jpeg", "png"] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** Default lossy format — cuts image token cost by 60-80% vs lossless PNG. */
export const DEFAULT_FORMAT: ImageFormat = "webp";

/** Default lossy quality (1-100). */
export const DEFAULT_QUALITY = 75;

/**
 * Encoding used by matrix_responsive_audit, interact_and_audit, and
 * annotated overlay shots. Multi-image and fused responses always use
 * aggressive lossy compression.
 */
export const MATRIX_FORMAT: ImageFormat = "webp";
export const MATRIX_QUALITY = 75;

/**
 * sizeMode controls what goes back over the wire: "full-res" returns the
 * normally encoded image; "thumb" returns a small webp thumbnail while the
 * full-resolution image lives on disk for human review.
 */
export const SIZE_MODES = ["full-res", "thumb"] as const;

export type SizeMode = (typeof SIZE_MODES)[number];

/** Chat-thumbnail encoding used when sizeMode is "thumb". */
export const THUMB_MAX_WIDTH = 480;
export const THUMB_QUALITY = 60;

/** How a captured frame should be encoded before being returned. */
export interface RenderOptions {
  format: ImageFormat;
  /** 1-100. Ignored when format is "png". */
  quality: number;
  /** Downscale to at most this many pixels wide before encoding. */
  maxWidth?: number | undefined;
}

/** An encoded screenshot, ready for an MCP image content block. */
export interface EncodedImage {
  /** Base64-encoded image bytes. */
  data: string;
  mimeType: "image/webp" | "image/jpeg" | "image/png";
  /** Final encoded dimensions in pixels (after any maxWidth downscale). */
  width: number;
  height: number;
  /** Encoded size in bytes — surfaced so agents see their token spend. */
  bytes: number;
}

/** Result of a single capture, with truncation metadata for huge pages. */
export interface CaptureResult {
  image: EncodedImage;
  /**
   * When a fullPage capture exceeded MAX_CAPTURE_HEIGHT_PX, the capture is
   * clipped and these report what was kept vs. the real document height.
   */
  truncatedToPx?: number;
  documentHeightPx?: number;
}

/** One entry in a matrix_responsive_audit result. */
export interface MatrixEntry {
  viewport: ViewportName;
  size: ViewportSize;
  capture: CaptureResult;
}

/**
 * Tallest fullPage capture we will return, in CSS pixels. Model APIs reject
 * images over ~8000px on a side; staying under it (after the device scale
 * factor is applied) keeps results consumable by every client.
 */
export const MAX_CAPTURE_HEIGHT_PX = 7_900;
