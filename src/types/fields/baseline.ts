/** zod field schemas for compare_to_baseline. */

import { z } from "zod";

import { BASELINE_ACTIONS, BASELINE_DIR } from "../baselines.js";

export const baselineActionField = z
  .enum(BASELINE_ACTIONS)
  .describe(
    "set_baseline saves the current render as the named baseline; " +
      "diff_against_baseline compares the current render to the saved one " +
      "and returns drift metrics plus a visual delta overlay.",
  );

export const baselineNameField = z
  .string()
  .min(1)
  .max(64)
  .describe(
    "Name for this baseline, e.g. 'homepage' or 'checkout-form'. Stored " +
      `per-viewport under ${BASELINE_DIR}/.`,
  );

export const maxVariancePctField = z
  .number()
  .min(0)
  .max(100)
  .optional()
  .describe(
    "Assertion / CI gate (diff_against_baseline only). If set, the diff is " +
      "marked a FAILURE (isError) when the variance percentage exceeds this " +
      "threshold — e.g. 0.5 fails on more than 0.5% pixel drift. Omit to " +
      "just report the variance without a pass/fail verdict.",
  );
