/** measure_layout_shift: Cumulative Layout Shift (CLS) Core Web Vital. */

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError, messageOf } from "../browser/errors.js";
import { navigateIfNeeded } from "../browser/navigation.js";
import {
  drainLayoutShiftInPage,
  installLayoutShiftObserver,
} from "../inpage/layout-shift.js";
import type { PageHealth } from "../types/health.js";
import type { CLSBand, LayoutShiftResult } from "../types/web-vitals.js";
import { type ViewportName } from "../types/viewports.js";

/** Observation window after load during which shifts are accumulated. */
const CLS_WINDOW_MS = 2_000;

function bandOf(cls: number): CLSBand {
  if (cls <= 0.1) return "good";
  if (cls <= 0.25) return "needs-improvement";
  return "poor";
}

/**
 * Cold-load CLS measurement: rebuild a pristine page, arm a layout-shift
 * PerformanceObserver via addInitScript BEFORE content parses, force a fresh
 * load, watch for CLS_WINDOW_MS, then drain the observer and resolve the
 * elements that moved. The context is rebuilt first so the observer never
 * stacks across calls (and because CLS is inherently a fresh-load metric — any
 * prior in-page state is intentionally discarded).
 */
export function measureLayoutShift(
  session: BrowserSession,
  url: string,
  viewport: ViewportName | undefined,
): Promise<{
  result: LayoutShiftResult;
  viewport: ViewportName;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const target = viewport ?? session.core.currentViewport ?? "desktop";

    // Pristine page: no lingering observer/init-script from a prior call.
    await session.core.recreateContext();
    const page = await session.core.ensurePage(target);

    await page.addInitScript(installLayoutShiftObserver);

    // Force a real load so the observer is present from the first paint.
    await navigateIfNeeded(session.core, page, url, { forceReload: true });
    await page.waitForTimeout(CLS_WINDOW_MS);

    let drained: {
      cls: number;
      shiftCount: number;
      offenders: Array<{ selector: string; label: string; value: number }>;
      hadData: boolean;
    };
    try {
      drained = await page.evaluate(drainLayoutShiftInPage);
    } catch (error) {
      throw new BrowserToolError(
        `Could not read layout-shift data from the page: ${messageOf(error)}`,
      );
    }

    const result: LayoutShiftResult = {
      cls: drained.cls,
      band: bandOf(drained.cls),
      shiftCount: drained.shiftCount,
      offenders: drained.offenders,
      hadData: drained.hadData,
      windowMs: CLS_WINDOW_MS,
    };
    return { result, viewport: target, health: await session.core.drainHealth() };
  });
}
