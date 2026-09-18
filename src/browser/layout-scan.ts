/** Node-side wrapper around the in-page layout scanner + selector collection. */

import type { Page } from "playwright-core";

import { scanLayoutInPage } from "../inpage/layout-scan.js";
import type { LayoutScan } from "../types/layout.js";
import type { ViewportSize } from "../types/viewports.js";
import { BrowserToolError, messageOf } from "./errors.js";

export async function runLayoutScan(
  page: Page,
  size: ViewportSize,
  checkTapTargets: boolean,
  ignore: string[] = [],
): Promise<LayoutScan> {
  try {
    return await page.evaluate(scanLayoutInPage, {
      vw: size.width,
      vh: size.height,
      checkTapTargets,
      ignore,
    });
  } catch (error) {
    throw new BrowserToolError(
      `Layout scan failed on the live page: ${messageOf(error)}`,
    );
  }
}

/** Every distinct element implicated by a scan, deduped, for the overlay. */
export function collectIssueSelectors(scan: LayoutScan): string[] {
  const selectors = new Set<string>();
  for (const o of scan.offenders) {
    selectors.add(o.selector);
  }
  for (const c of scan.containerIssues) {
    selectors.add(c.selector);
  }
  for (const t of scan.textClips) {
    selectors.add(t.selector);
  }
  for (const t of scan.tapTargetViolations) {
    selectors.add(t.selector);
  }
  for (const o of scan.overlaps) {
    selectors.add(o.selectorA);
    selectors.add(o.selectorB);
  }
  return Array.from(selectors).slice(0, 80);
}

/** Distinct layout findings in a scan, used for summaries and manifests. */
export function countLayoutIssues(scan: LayoutScan): number {
  return (
    (scan.pageOverflowPx > 0 ? 1 : 0) +
    scan.overlaps.length +
    scan.containerIssues.length +
    scan.textClips.length +
    scan.tapTargetViolations.length
  );
}
