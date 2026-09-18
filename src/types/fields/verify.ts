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
          '"noViewportOverflow" (right edge ≤ viewport width), "minTapTarget" ' +
            '(≥ px on both axes, default 44), "fontSizeAtMost"/"fontSizeAtLeast" ' +
            '(computed font-size vs px), "exists"/"notExists".',
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
    "Assertions to evaluate against the live page. Each reports measured vs " +
      "expected, plus an overall PASS/FAIL verdict.",
  );

export const verifySaveAsField = z
  .string()
  .min(1)
  .optional()
  .describe("Name to snapshot the verdict under .agent-eyes/verify/.");
