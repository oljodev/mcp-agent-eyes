/** zod field schemas for the diagnostic sweep + visual-regression tools. */

import { z } from "zod";

export const sweepMinWidthField = z
  .number()
  .int()
  .min(200)
  .max(3840)
  .default(320)
  .describe(
    "Smallest width to probe, CSS px (default 320).",
  );

export const sweepMaxWidthField = z
  .number()
  .int()
  .min(200)
  .max(3840)
  .default(1920)
  .describe(
    "Largest width to probe, CSS px (default 1920).",
  );

export const sweepStepField = z
  .number()
  .int()
  .min(10)
  .max(500)
  .default(50)
  .describe(
    "Width increment between probes (default 50). Smaller is finer but " +
      "slower; total steps are capped.",
  );

export const maxClsField = z
  .number()
  .min(0)
  .max(5)
  .optional()
  .describe(
    "CI gate: FAIL when CLS exceeds this (0.1 is the Core Web Vitals bar). " +
      "Omit to report without a verdict.",
  );

export const tagField = z
  .string()
  .min(1)
  .max(64)
  .describe(
    "Baseline to diff against — the name used with set_baseline.",
  );

export const ignoreSelectorField = z
  .union([z.string().min(1), z.array(z.string().min(1))])
  .optional()
  .describe(
    "Selector(s) to exclude from the audit, string or array. Matches and " +
      "their descendants are suppressed and counted — silences known noise " +
      "like a cookie banner.",
  );
