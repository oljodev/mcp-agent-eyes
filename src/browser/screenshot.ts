/** Raw PNG screenshot capture (viewport-fold and full-page, with a height cap). */

import type { Page } from "playwright-core";

import { MAX_CAPTURE_HEIGHT_PX } from "../types/images.js";
import { VIEWPORTS } from "../types/viewports.js";
import { BrowserToolError, messageOf } from "./errors.js";
import { deviceScaleFactor } from "./image-utils.js";

/** Lossless viewport-fold PNG — the source format for baselines. */
export async function rawViewportScreenshot(page: Page): Promise<Buffer> {
  try {
    return await page.screenshot({ type: "png", animations: "disabled" });
  } catch (error) {
    throw new BrowserToolError(
      `Failed to capture screenshot: ${messageOf(error)}`,
    );
  }
}

export async function rawScreenshot(
  page: Page,
  fullPage: boolean,
): Promise<{ png: Buffer; truncatedToPx?: number; documentHeightPx?: number }> {
  if (!fullPage) {
    return { png: await rawViewportScreenshot(page) };
  }

  let documentHeight: number;
  try {
    documentHeight = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return Math.ceil(root.scrollHeight);
    });
  } catch {
    documentHeight = 0; // measurement failed — fall through to fullPage
  }

  // Model APIs reject images over ~8000px on a side; clip mega-pages.
  const capCssPx = Math.floor(MAX_CAPTURE_HEIGHT_PX / deviceScaleFactor());

  try {
    if (documentHeight > capCssPx) {
      const viewport = page.viewportSize() ?? VIEWPORTS.desktop;
      // clip alone is bounded to the viewport; fullPage must accompany it
      // for the clip rectangle to address full document coordinates.
      const png = await page.screenshot({
        type: "png",
        animations: "disabled",
        fullPage: true,
        clip: { x: 0, y: 0, width: viewport.width, height: capCssPx },
      });
      return { png, truncatedToPx: capCssPx, documentHeightPx: documentHeight };
    }
    const png = await page.screenshot({
      type: "png",
      fullPage: true,
      animations: "disabled",
    });
    return documentHeight > 0
      ? { png, documentHeightPx: documentHeight }
      : { png };
  } catch (error) {
    throw new BrowserToolError(
      `Failed to capture screenshot: ${messageOf(error)}`,
    );
  }
}
