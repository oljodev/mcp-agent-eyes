/** zod field schemas for verify_fix. */

import { z } from "zod";

import { ASSERT_KINDS } from "../verify.js";

export const verifyChecksField = z
  .array(
    z.object({
      selector: z.string().min(1).describe("CSS selector of the element to check."),
      assert: z
        .enum(ASSERT_KINDS)
        .describe(
          'The assertion: "noViewportOverflow" (element\'s right edge ≤ viewport ' +
            'width — catches a hero/H1 wider than the screen), "minTapTarget" ' +
            '(≥ px in BOTH width and height; px defaults to 44), "fontSizeAtMost" / ' +
            '"fontSizeAtLeast" (computed font-size vs px), "exists" / "notExists".',
        ),
      px: z
        .number()
        .positive()
        .optional()
        .describe("Pixel threshold for minTapTarget / fontSize* (minTapTarget defaults to 44)."),
    }),
  )
  .min(1)
  .describe(
    "The assertions to evaluate against the live page. Each is a small, " +
      "measurable check; the tool reports the measured value vs the expectation " +
      "per check, plus an overall PASS/FAIL verdict.",
  );

export const verifySaveAsField = z
  .string()
  .min(1)
  .optional()
  .describe("Optional name to snapshot the verdict under .agent-eyes/verify/<name>.json.");
