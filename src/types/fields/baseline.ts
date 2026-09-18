/** zod field schemas for compare_to_baseline. */

import { z } from "zod";

import { BASELINE_ACTIONS, BASELINE_DIR } from "../baselines.js";

export const baselineActionField = z
  .enum(BASELINE_ACTIONS)
  .describe(
    "set_baseline saves the current render under the name; " +
      "diff_against_baseline compares against it and returns drift metrics " +
      "plus a delta overlay.",
  );

export const baselineNameField = z
  .string()
  .min(1)
  .max(64)
  .describe(
    `Baseline name, e.g. 'homepage'. Stored per-viewport under ${BASELINE_DIR}/.`,
  );

export const maxVariancePctField = z
  .number()
  .min(0)
  .max(100)
  .optional()
  .describe(
    "CI gate for diff_against_baseline: FAIL when variance exceeds this " +
      "percentage (0.5 = 0.5% pixel drift). Omit to report without a verdict.",
  );
