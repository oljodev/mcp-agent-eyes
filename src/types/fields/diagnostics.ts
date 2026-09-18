/** zod field schemas for the diagnostic sweep + visual-regression tools. */

import { z } from "zod";

export const sweepMinWidthField = z
  .number()
  .int()
  .min(200)
  .max(3840)
  .default(320)
  .describe(
    "Smallest viewport width (CSS px) to probe in the responsive sweep " +
      "(default 320 — small phone).",
  );

export const sweepMaxWidthField = z
  .number()
  .int()
  .min(200)
  .max(3840)
  .default(1920)
  .describe(
    "Largest viewport width (CSS px) to probe in the responsive sweep " +
      "(default 1920 — full-HD desktop).",
  );

export const sweepStepField = z
  .number()
  .int()
  .min(10)
  .max(500)
  .default(50)
  .describe(
    "Width increment (CSS px) between probes (default 50). Smaller = finer " +
      "breakpoint resolution but more steps; the sweep caps total steps to " +
      "stay fast.",
  );

export const maxClsField = z
  .number()
  .min(0)
  .max(5)
  .optional()
  .describe(
    "Assertion / CI gate. If set, the response is marked a FAILURE (isError) " +
      "when the measured CLS exceeds this threshold — e.g. 0.1 enforces the " +
      "Core Web Vitals 'good' bar. Omit to just report the score.",
  );

export const tagField = z
  .string()
  .min(1)
  .max(64)
  .describe(
    "Baseline identifier to diff against — the same name passed to " +
      "compare_to_baseline's set_baseline (stored per-viewport under " +
      ".agent-eyes/baselines/).",
  );

export const ignoreSelectorField = z
  .union([z.string().min(1), z.array(z.string().min(1))])
  .optional()
  .describe(
    "CSS selector(s) to exclude from the layout audit — a string or array. " +
      "Any finding whose element matches, or sits inside, an ignore selector " +
      "is suppressed (and the suppressed count reported). Use it to silence " +
      "known, unfixable noise (a fixed sidebar, a cookie banner, a " +
      "third-party widget) so new, real issues stand out instead of being " +
      "buried under the same repeats on every page and every step.",
  );
