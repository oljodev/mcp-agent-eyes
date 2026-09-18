/** label_interactives: numbered "set-of-mark" overlay + selector legend. */

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError, messageOf } from "../browser/errors.js";
import { navigateIfNeeded } from "../browser/navigation.js";
import { rawScreenshot } from "../browser/screenshot.js";
import { labelInteractivesInPage } from "../inpage/label-interactives.js";
import type { PageHealth } from "../types/health.js";
import { MATRIX_FORMAT, MATRIX_QUALITY, type EncodedImage, type RenderOptions } from "../types/images.js";
import type { InteractiveMark } from "../types/marks.js";
import type { RunInfo, SavedShot } from "../types/persistence.js";
import { type ViewportName } from "../types/viewports.js";

/**
 * Paint a numbered badge over every interactive element in the viewport,
 * screenshot the page WITH the badges, then remove the overlay (non-
 * destructive). Returns the marked image plus a legend mapping each number to
 * a stable selector + label, so a follow-up interact_and_audit can target the
 * exact element the agent picked off the picture.
 */
export function labelInteractives(
  session: BrowserSession,
  url: string,
  viewport: ViewportName | undefined,
  reload = false,
): Promise<{
  image: EncodedImage;
  marks: InteractiveMark[];
  candidates: number;
  truncated: boolean;
  viewport: ViewportName;
  saved: SavedShot;
  run: RunInfo;
  galleryPath: string;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const target = viewport ?? session.core.currentViewport ?? "desktop";
    const page = await session.core.ensurePage(target);
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });

    let scan: { marks: InteractiveMark[]; candidates: number; truncated: boolean };
    let image: EncodedImage;
    try {
      scan = await page.evaluate(labelInteractivesInPage);
      const render: RenderOptions = { format: MATRIX_FORMAT, quality: MATRIX_QUALITY };
      const raw = await rawScreenshot(page, false);
      image = await session.encoder.encode(raw.png, render);
    } finally {
      // Always strip our scaffolding from the persistent page's DOM.
      await page
        .evaluate(() => document.getElementById("__agent_eyes_marks__")?.remove())
        .catch(() => undefined);
    }

    if (scan.marks.length === 0) {
      throw new BrowserToolError(
        "No interactive elements were found in the current viewport. The page " +
          "may not have rendered yet, or its controls may sit below the fold — " +
          "scroll with interact_and_audit, then try again.",
      );
    }

    const run = await session.store.newRun(page.url());
    let saved: SavedShot;
    try {
      saved = await session.store.saveShot(
        {
          tool: "marks",
          viewport: target,
          url: page.url(),
          fragment: null,
          annotated: true,
          issueCount: null,
        },
        image,
      );
    } catch (error) {
      throw new BrowserToolError(`Failed to persist the marked screenshot: ${messageOf(error)}`);
    }
    const galleryPath = await session.store.writeGallery();

    return {
      image,
      marks: scan.marks,
      candidates: scan.candidates,
      truncated: scan.truncated,
      viewport: target,
      saved,
      run,
      galleryPath,
      health: await session.core.drainHealth(),
    };
  });
}
