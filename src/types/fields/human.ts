/** zod field schemas for await_human_interaction. No field carries a secret. */

import { z } from "zod";

import { HUMAN_HANDOFF_MAX_MS } from "../timeouts.js";

export const handoffReasonField = z
  .string()
  .min(1)
  .describe(
    "Plain-language instruction telling the human what to do in the browser " +
      "window, e.g. \"Solve the Cloudflare 'Verify you are human' check, then " +
      'click Done." Shown on the localhost prompt. The AI never solves the ' +
      "challenge itself — it only hands off to the human and waits.",
  );

export const expectUrlContainsField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Optional substring. If set, the handoff ALSO auto-completes the moment the " +
      "page navigates to a URL containing it — so a CAPTCHA that redirects on " +
      "success finishes without the human needing to click Done.",
  );

export const handoffTimeoutField = z
  .number()
  .int()
  .positive()
  .max(HUMAN_HANDOFF_MAX_MS)
  .optional()
  .describe(
    "How long to wait for the human (ms). Defaults to 180000 (3 min), capped at " +
      `${HUMAN_HANDOFF_MAX_MS}. On expiry the tool returns status=timeout, never hangs.`,
  );

export const handoffScreenshotField = z
  .boolean()
  .default(false)
  .describe(
    "Include a screenshot of the resulting page in the response (default off). " +
      "A CAPTCHA/challenge page is not a secret, so this is allowed here — but " +
      "it stays opt-in, consistent with the auth tools' caution.",
  );
