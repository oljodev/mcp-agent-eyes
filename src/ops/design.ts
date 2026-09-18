/** review_design and extract_design_tokens operations. */

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError, messageOf } from "../browser/errors.js";
import { navigateIfNeeded } from "../browser/navigation.js";
import { reviewDesignInPage } from "../inpage/design-review.js";
import { extractStyleInPage } from "../inpage/extract-style.js";
import {
  DESIGN_LIMITS,
  MAX_DESIGN_ELEMENTS,
  STYLES_DIR,
  type DesignReview,
  type StyleTokens,
} from "../types/design.js";
import type { PageHealth } from "../types/health.js";
import type { ViewportName } from "../types/viewports.js";
import { sanitizeBaselineName } from "./baseline.js";

/**
 * Zero-image DESIGN review: measures the page's actual design system
 * (color palette, type scale, spacing rhythm, radii, shadows) and flags
 * "design smells" — the amateur tells that separate a designed UI from a
 * generated one. Pure text; the taste counterpart to scan_accessibility.
 */
export function reviewDesign(
  session: BrowserSession,
  url: string,
  viewport: ViewportName | undefined,
  reload = false,
): Promise<{
  review: DesignReview;
  viewport: ViewportName;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const target = viewport ?? session.core.currentViewport ?? "desktop";
    const page = await session.core.ensurePage(target);
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });
    let review: DesignReview;
    try {
      review = await page.evaluate(reviewDesignInPage, {
        ...DESIGN_LIMITS,
        maxElements: MAX_DESIGN_ELEMENTS,
      });
    } catch (error) {
      throw new BrowserToolError(
        `Design review failed on the live page: ${messageOf(error)}`,
      );
    }
    return { review, viewport: target, health: await session.core.drainHealth() };
  });
}

/**
 * "Steal this style": extract a buildable design-token spec from any URL —
 * the inferred color roles (background/text/accent, incl. accent gradient),
 * type scale, spacing scale, radii, shadows, and fonts — so the agent can
 * build TO a reference style instead of guessing. Optionally persists the
 * tokens to .agent-eyes/styles/<name>.json.
 */
export function extractStyleTokens(
  session: BrowserSession,
  url: string,
  viewport: ViewportName | undefined,
  reload: boolean,
  saveAs: string | undefined,
): Promise<{
  tokens: StyleTokens;
  savedPath: string | null;
  viewport: ViewportName;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const target = viewport ?? session.core.currentViewport ?? "desktop";
    const page = await session.core.ensurePage(target);
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });
    let tokens: StyleTokens;
    try {
      tokens = await page.evaluate(extractStyleInPage, {
        maxElements: MAX_DESIGN_ELEMENTS,
      });
    } catch (error) {
      throw new BrowserToolError(
        `Style extraction failed on the live page: ${messageOf(error)}`,
      );
    }
    let savedPath: string | null = null;
    if (saveAs) {
      const dir = path.resolve(process.cwd(), STYLES_DIR);
      await mkdir(dir, { recursive: true });
      await session.store.ensureGitignore();
      const file = path.join(dir, `${sanitizeBaselineName(saveAs)}.json`);
      const tmp = `${file}.tmp-${process.pid}`;
      await writeFile(tmp, JSON.stringify({ url, ...tokens }, null, 2));
      await rename(tmp, file);
      savedPath = file;
    }
    return {
      tokens,
      savedPath,
      viewport: target,
      health: await session.core.drainHealth(),
    };
  });
}
