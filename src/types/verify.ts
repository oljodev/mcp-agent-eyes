/**
 * Types for verify_fix — confirm a change actually reached the LIVE deployed
 * page. Small, measurable assertions (reusing the measure_element internals) so
 * "the tool said fixed but production still has the bug" can't happen silently.
 */

import type { PageHealth } from "./health.js";
import type { ViewportName } from "./viewports.js";

export const ASSERT_KINDS = [
  "noViewportOverflow",
  "minTapTarget",
  "fontSizeAtMost",
  "fontSizeAtLeast",
  "exists",
  "notExists",
] as const;
export type AssertKind = (typeof ASSERT_KINDS)[number];

/** One assertion against one element on the live page. */
export interface VerifyAssertion {
  selector: string;
  assert: AssertKind;
  /** Pixel threshold for minTapTarget / fontSize* (minTapTarget defaults to 44). */
  px?: number | undefined;
}

export interface VerifyInput {
  url: string;
  viewport?: ViewportName | undefined;
  /** Reload to read the LIVE deployed DOM (default true). */
  reload?: boolean | undefined;
  checks: VerifyAssertion[];
  /** Optional name to snapshot the verdict under .agent-eyes/verify/. */
  saveAs?: string | undefined;
}

export interface VerifyCheckResult {
  selector: string;
  assert: AssertKind;
  ok: boolean;
  /** The measured value, formatted for the report (e.g. "640px", "30x30"). */
  measured: string;
  /** The expectation, formatted (e.g. "≤ 390px", "≥ 44x44"). */
  expected: string;
}

export interface VerifyResult {
  url: string;
  viewport: ViewportName;
  passed: number;
  failed: number;
  total: number;
  checks: VerifyCheckResult[];
  /** Overall verdict: true only when every check passed. */
  verdict: boolean;
  /** Path the verdict was snapshotted to, when saveAs was given. */
  savedTo?: string;
  health: PageHealth;
}
