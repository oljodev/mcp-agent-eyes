/** zod field schemas for await_human_interaction. No field carries a secret. */

import { z } from "zod";

import { HUMAN_HANDOFF_MAX_MS } from "../timeouts.js";

export const handoffReasonField = z
  .string()
  .min(1)
  .describe(
    "Plain-language instruction shown to the human, e.g. \"Solve the " +
      'Cloudflare check, then click Done."',
  );

export const expectUrlContainsField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Also auto-complete when the page reaches a URL containing this, so a " +
      "challenge that redirects on success needs no click.",
  );

export const handoffTimeoutField = z
  .number()
  .int()
  .positive()
  .max(HUMAN_HANDOFF_MAX_MS)
  .optional()
  .describe(
    "How long to wait for the human, ms (default 180000, max " +
      `${HUMAN_HANDOFF_MAX_MS}). On expiry returns status=timeout, never hangs.`,
  );

export const handoffScreenshotField = z
  .boolean()
  .default(false)
  .describe(
    "Include a screenshot of the resulting page. Default off.",
  );
