/**
 * verify_fix — confirm a change actually reached the LIVE deployed page.
 *
 * Reloads by default so it reads the freshly deployed DOM (not a stale tab),
 * measures each asserted element with the measure_element internals, and returns
 * a per-check PASS/FAIL table with measured-vs-expected plus an overall verdict.
 * This is the flow that catches "the tool claimed fixed but production still has
 * the bug" (e.g. a responsive font-size that never deployed).
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { BrowserToolError, messageOf } from "../browser/errors.js";
import { navigateIfNeeded } from "../browser/navigation.js";
import { slugify } from "../browser/paths.js";
import type { BrowserSession } from "../browser/session.js";
import { measureElementInPage } from "../inpage/measure-element.js";
import { AGENT_EYES_DIR } from "../types/persistence.js";
import type { VerifyCheckResult, VerifyInput, VerifyResult } from "../types/verify.js";
import { type ViewportName } from "../types/viewports.js";
import { evaluateCheck, type MeasuredElement } from "./verify-eval.js";

export function verifyFix(session: BrowserSession, input: VerifyInput): Promise<VerifyResult> {
  return session.core.runExclusive(async () => {
    const target = input.viewport ?? session.core.currentViewport ?? "desktop";
    const page = await session.core.ensurePage(target);
    // reload defaults TRUE — read the LIVE deployed DOM, never a stale tab.
    await navigateIfNeeded(session.core, page, input.url, {
      forceReload: input.reload ?? true,
    });

    const viewportWidth = await page
      .evaluate(() => document.documentElement.clientWidth)
      .catch(() => 0);

    const checks: VerifyCheckResult[] = [];
    for (const check of input.checks) {
      let measured: MeasuredElement = { found: false };
      try {
        const outcome = await page.evaluate(measureElementInPage, check.selector);
        if (outcome.found) {
          measured = {
            found: true,
            rect: outcome.measurement.rect,
            fontSizePx: parseFloat(outcome.measurement.typography.fontSize),
          };
        }
      } catch (error) {
        throw new BrowserToolError(
          `verify_fix could not measure "${check.selector}": ${messageOf(error)}`,
        );
      }
      checks.push(evaluateCheck(check, measured, viewportWidth));
    }

    const passed = checks.filter((c) => c.ok).length;
    const failed = checks.length - passed;
    const result: VerifyResult = {
      url: page.url(),
      viewport: target,
      passed,
      failed,
      total: checks.length,
      checks,
      verdict: failed === 0,
      health: await session.core.drainHealth(),
    };
    if (input.saveAs) {
      result.savedTo = await saveVerdict(input.saveAs, result, target);
    }
    return result;
  });
}

/** Snapshot the verdict to .agent-eyes/verify/<name>.json (atomic write). */
async function saveVerdict(
  name: string,
  result: VerifyResult,
  viewport: ViewportName,
): Promise<string> {
  const dir = path.resolve(process.cwd(), AGENT_EYES_DIR, "verify");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${slugify(name) || "verdict"}.json`);
  const body = JSON.stringify(
    {
      url: result.url,
      viewport,
      verdict: result.verdict,
      passed: result.passed,
      failed: result.failed,
      checks: result.checks,
    },
    null,
    2,
  );
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, `${body}\n`);
  await rename(tmp, file);
  return file;
}
