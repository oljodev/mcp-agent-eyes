/** capture_page_screenshot and matrix_responsive_audit operations. */

import type { BrowserSession } from "../browser/session.js";
import { navigateIfNeeded, applyViewport } from "../browser/navigation.js";
import { rawScreenshot } from "../browser/screenshot.js";
import type { PageHealth } from "../types/health.js";
import {
  MATRIX_FORMAT,
  MATRIX_QUALITY,
  type CaptureResult,
  type MatrixEntry,
  type RenderOptions,
  type SizeMode,
} from "../types/images.js";
import type { RunInfo, SavedShot } from "../types/persistence.js";
import { VIEWPORTS, VIEWPORT_NAMES, type ViewportName } from "../types/viewports.js";

/**
 * Navigate (if needed), capture, persist the full-resolution render to a
 * fresh run directory, and return the wire image (full-res or thumb).
 */
export function capture(
  session: BrowserSession,
  url: string,
  viewport: ViewportName,
  fullPage: boolean,
  render: RenderOptions,
  sizeMode: SizeMode,
  reload = false,
): Promise<{
  capture: CaptureResult;
  saved: SavedShot;
  run: RunInfo;
  galleryPath: string;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const page = await session.core.ensurePage(viewport);
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });

    const raw = await rawScreenshot(page, fullPage);
    // The disk copy is always full resolution in the requested format;
    // maxWidth and thumb-mode only shrink what goes over the wire.
    const diskImage = await session.encoder.encode(raw.png, {
      format: render.format,
      quality: render.quality,
    });
    const chatImage = await session.encoder.chatVariant(
      raw.png,
      diskImage,
      render,
      sizeMode,
    );

    const run = await session.store.newRun(page.url());
    const saved = await session.store.saveShot(
      {
        tool: "capture",
        viewport,
        url: page.url(),
        fragment: fullPage ? "fullpage" : null,
        annotated: false,
        issueCount: null,
      },
      diskImage,
    );
    const galleryPath = await session.store.writeGallery();

    const captureResult: CaptureResult = { image: chatImage };
    if (raw.truncatedToPx !== undefined) {
      captureResult.truncatedToPx = raw.truncatedToPx;
    }
    if (raw.documentHeightPx !== undefined) {
      captureResult.documentHeightPx = raw.documentHeightPx;
    }
    return {
      capture: captureResult,
      saved,
      run,
      galleryPath,
      health: await session.core.drainHealth(),
    };
  });
}

/**
 * Capture the page at every breakpoint, smallest to largest, always with
 * aggressive lossy compression. All four shots are persisted into one new
 * run directory. The previously active viewport is restored afterwards so
 * the audit doesn't silently leave the session at ultrawide.
 */
export function captureMatrix(
  session: BrowserSession,
  url: string,
  fullPage: boolean,
  sizeMode: SizeMode,
  reload = false,
): Promise<{
  entries: Array<MatrixEntry & { saved: SavedShot }>;
  run: RunInfo;
  galleryPath: string;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const before = session.core.currentViewport;
    const page = await session.core.ensurePage(before ?? "mobile");
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });

    const render: RenderOptions = {
      format: MATRIX_FORMAT,
      quality: MATRIX_QUALITY,
    };
    const run = await session.store.newRun(url);
    const entries: Array<MatrixEntry & { saved: SavedShot }> = [];
    for (const viewport of VIEWPORT_NAMES) {
      await applyViewport(session.core, page, viewport);
      const raw = await rawScreenshot(page, fullPage);
      const diskImage = await session.encoder.encode(raw.png, render);
      const chatImage = await session.encoder.chatVariant(
        raw.png,
        diskImage,
        render,
        sizeMode,
      );
      const saved = await session.store.saveShot(
        {
          tool: "matrix",
          viewport,
          url: page.url(),
          fragment: fullPage ? "fullpage" : null,
          annotated: false,
          issueCount: null,
        },
        diskImage,
      );
      const capture: CaptureResult = { image: chatImage };
      if (raw.truncatedToPx !== undefined) {
        capture.truncatedToPx = raw.truncatedToPx;
      }
      if (raw.documentHeightPx !== undefined) {
        capture.documentHeightPx = raw.documentHeightPx;
      }
      entries.push({ viewport, size: VIEWPORTS[viewport], capture, saved });
    }
    if (before !== null) {
      await applyViewport(session.core, page, before);
    }
    const galleryPath = await session.store.writeGallery();
    return {
      entries,
      run,
      galleryPath,
      health: await session.core.drainHealth(),
    };
  });
}
