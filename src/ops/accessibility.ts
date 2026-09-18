/** scan_accessibility operation. */

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError, messageOf } from "../browser/errors.js";
import { navigateIfNeeded } from "../browser/navigation.js";
import { scanAccessibilityInPage } from "../inpage/accessibility-scan.js";
import type { AccessibilityScan } from "../types/accessibility.js";
import type { PageHealth } from "../types/health.js";
import type { ViewportName } from "../types/viewports.js";

/**
 * Zero-image accessibility scan: navigates (if needed), optionally
 * resizes, and audits the live DOM for foundational WCAG failures —
 * images without alternates, broken heading hierarchy, and interactive
 * controls with no computable accessible name. Pure text.
 */
export function scanAccessibility(
  session: BrowserSession,
  url: string,
  viewport: ViewportName | undefined,
  reload = false,
): Promise<{
  scan: AccessibilityScan;
  viewport: ViewportName;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const target = viewport ?? session.core.currentViewport ?? "desktop";
    const page = await session.core.ensurePage(target);
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });
    let scan: AccessibilityScan;
    try {
      scan = await page.evaluate(scanAccessibilityInPage);
    } catch (error) {
      throw new BrowserToolError(
        `Accessibility scan failed on the live page: ${messageOf(error)}`,
      );
    }
    return { scan, viewport: target, health: await session.core.drainHealth() };
  });
}
