/** capture_element: crop a screenshot to a single element. */

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError, messageOf } from "../browser/errors.js";
import { navigateIfNeeded } from "../browser/navigation.js";
import { slugify } from "../browser/paths.js";
import {
  MATRIX_FORMAT,
  MATRIX_QUALITY,
  type CaptureResult,
  type RenderOptions,
} from "../types/images.js";
import type { PageHealth } from "../types/health.js";
import type { RunInfo, SavedShot } from "../types/persistence.js";
import { type ViewportName } from "../types/viewports.js";

/**
 * Navigate, apply the viewport, resolve the element via Playwright's locator,
 * and capture an isolated crop of just that node (locator.screenshot) — far
 * cheaper than a full page when you only need to look at one component. The
 * full-resolution crop is saved to disk; a small webp thumbnail goes on the
 * wire.
 */
export function captureElement(
  session: BrowserSession,
  url: string,
  selector: string,
  viewport: ViewportName | undefined,
  reload = false,
): Promise<{
  capture: CaptureResult;
  saved: SavedShot;
  box: { width: number; height: number } | null;
  run: RunInfo;
  galleryPath: string;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const target = viewport ?? session.core.currentViewport ?? "desktop";
    const page = await session.core.ensurePage(target);
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });

    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      throw new BrowserToolError(
        `No element matches selector "${selector}" at ${target}. The element ` +
          "may only exist at another breakpoint, or the selector may be off — " +
          "verify it against the most recent screenshot or a detect_layout_matrix.",
      );
    }

    let png: Buffer;
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 5_000 });
      png = await locator.screenshot({ type: "png", animations: "disabled" });
    } catch (error) {
      throw new BrowserToolError(
        `Could not crop "${selector}": ${messageOf(error)} — the element may ` +
          "be hidden, zero-size, or covered. Confirm it is visible at this viewport.",
      );
    }

    const box = await locator.boundingBox().catch(() => null);

    const render: RenderOptions = { format: MATRIX_FORMAT, quality: MATRIX_QUALITY };
    const diskImage = await session.encoder.encode(png, render);
    // Element crops are small; a thumb keeps the wire image token-cheap.
    const chatImage = await session.encoder.chatVariant(png, diskImage, render, "thumb");

    const run = await session.store.newRun(page.url());
    const saved = await session.store.saveShot(
      {
        tool: "element",
        viewport: target,
        url: page.url(),
        fragment: slugify(selector),
        annotated: false,
        issueCount: null,
      },
      diskImage,
    );
    const galleryPath = await session.store.writeGallery();

    return {
      capture: { image: chatImage },
      saved,
      box: box ? { width: Math.round(box.width), height: Math.round(box.height) } : null,
      run,
      galleryPath,
      health: await session.core.drainHealth(),
    };
  });
}
