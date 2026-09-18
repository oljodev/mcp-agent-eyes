/** measure_element operation (tokenless inspector). */

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError, messageOf } from "../browser/errors.js";
import { navigateIfNeeded } from "../browser/navigation.js";
import {
  measureElementInPage,
  type MeasureOutcome,
} from "../inpage/measure-element.js";
import type { PageHealth } from "../types/health.js";
import type { ElementMeasurement } from "../types/measurement.js";
import { VIEWPORTS, type ViewportName } from "../types/viewports.js";

/**
 * Tokenless element inspector: resize to the requested viewport (if any),
 * navigate (if needed), and extract the element's live computed rendering
 * properties — dimensions, typography, spacing, effective colors, and a
 * WCAG contrast verdict. Pure text; no screenshot, no run, no image
 * tokens.
 */
export function measureElement(
  session: BrowserSession,
  url: string,
  selector: string,
  viewport: ViewportName | undefined,
  reload = false,
): Promise<{
  measurement: ElementMeasurement;
  viewport: ViewportName;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const target = viewport ?? session.core.currentViewport ?? "desktop";
    const page = await session.core.ensurePage(target);
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });

    let outcome: MeasureOutcome;
    try {
      outcome = await page.evaluate(measureElementInPage, selector);
    } catch (error) {
      throw new BrowserToolError(
        `Element measurement failed on the live page: ${messageOf(error)}`,
      );
    }
    if (!outcome.found) {
      throw new BrowserToolError(
        outcome.reason === "invalid-selector"
          ? `"${selector}" is not a valid CSS selector.`
          : `No element matches selector "${selector}" at ` +
            `${target} (${VIEWPORTS[target].width}x${VIEWPORTS[target].height}). ` +
            "The element may only exist at another breakpoint — try " +
            'passing a different "viewport", or verify the selector ' +
            "against the most recent screenshot or layout report.",
      );
    }
    return {
      measurement: outcome.measurement,
      viewport: target,
      health: await session.core.drainHealth(),
    };
  });
}
