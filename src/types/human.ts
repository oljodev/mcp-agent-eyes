/**
 * Types for await_human_interaction — the human-takeover handoff. The AI pauses
 * automation and asks the human to act in the live (headed) browser window, then
 * resumes. Nothing here is a secret; the page may be a CAPTCHA, which is fine to
 * screenshot, so an optional image is allowed (unlike the auth tools).
 */

import type { PageHealth } from "./health.js";
import type { EncodedImage } from "./images.js";

/** How a handoff ended. */
export const HUMAN_INTERACTION_STATUS = ["completed", "cancelled", "timeout"] as const;
export type HumanInteractionStatus = (typeof HUMAN_INTERACTION_STATUS)[number];

export interface HumanInteractionInput {
  /** Plain-language instruction shown to the human on the localhost prompt. */
  reason: string;
  /** Auto-complete the moment the page navigates to a URL containing this. */
  expectUrlContains?: string | undefined;
  /** How long to wait before giving up (ms). Defaults to 180000, capped ~600000. */
  timeoutMs?: number | undefined;
  /** Include a screenshot of the resulting page (default off). */
  screenshot?: boolean | undefined;
}

export interface HumanInteractionResult {
  status: HumanInteractionStatus;
  url: string;
  /** Present only when screenshot was requested and the handoff completed. */
  image?: EncodedImage;
  health: PageHealth;
}
