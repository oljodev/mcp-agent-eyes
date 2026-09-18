/** evaluate_script operation (opt-in arbitrary in-page JS). */

import type { Page } from "playwright-core";

import type { BrowserSession } from "../browser/session.js";
import { evaluateInPage } from "../browser/eval-in-page.js";
import { applyViewport, navigateIfNeeded } from "../browser/navigation.js";
import type { PageHealth } from "../types/health.js";
import type { ViewportName } from "../types/viewports.js";

/**
 * Run a JS snippet in the page context and return its JSON-serializable
 * result as text. Gated behind AGENT_EYES_ALLOW_EVAL at the tool layer.
 * Navigate-first only when a url is given (else act on the open page).
 */
export function evaluateScript(
  session: BrowserSession,
  script: string,
  url: string | undefined,
  viewport: ViewportName | undefined,
  reload = false,
): Promise<{ result: string; viewport: ViewportName; health: PageHealth }> {
  return session.core.runExclusive(async () => {
    let page: Page;
    if (url) {
      const target = viewport ?? session.core.currentViewport ?? "desktop";
      page = await session.core.ensurePage(target);
      await navigateIfNeeded(session.core, page, url, { forceReload: reload });
    } else {
      page = session.core.activePage();
      if (viewport) {
        await applyViewport(session.core, page, viewport);
      }
    }

    const result = await evaluateInPage(page, script);
    return {
      result,
      viewport: session.core.currentViewport ?? "desktop",
      health: await session.core.drainHealth(),
    };
  });
}
