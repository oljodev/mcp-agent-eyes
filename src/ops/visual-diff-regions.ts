/**
 * visual_diff_regions: pixel-diff the current render against a saved baseline,
 * cluster the changed pixels into regions, and hit-test each region's center to
 * name the element underneath — turning "3.2% of pixels changed" into an
 * actionable, element-resolved change list.
 */

import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError } from "../browser/errors.js";
import { clusterDiffMask } from "../browser/diff-regions.js";
import { deviceScaleFactor, padToCanvas } from "../browser/image-utils.js";
import { navigateIfNeeded, resetScroll } from "../browser/navigation.js";
import { rawScreenshot } from "../browser/screenshot.js";
import { hitTestInPage } from "../inpage/hit-test.js";
import { BASELINE_DIR, DIFF_THRESHOLD } from "../types/baselines.js";
import type { PageHealth } from "../types/health.js";
import type { DiffRegion, VisualDiffRegionResult } from "../types/diff-regions.js";
import type { RunInfo } from "../types/persistence.js";
import { type ViewportName } from "../types/viewports.js";
import { sanitizeBaselineName } from "./baseline.js";

const MAX_REGIONS = 12;

export function visualDiffRegions(
  session: BrowserSession,
  url: string,
  tag: string,
  viewport: ViewportName | undefined,
  reload = false,
  fullPage = false,
): Promise<{
  result: VisualDiffRegionResult;
  viewport: ViewportName;
  run: RunInfo;
  galleryPath: string;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const target = viewport ?? session.core.currentViewport ?? "desktop";
    const page = await session.core.ensurePage(target);
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });
    await resetScroll(page);

    // Load the saved baseline for this viewport. fullPage baselines are
    // distinct artifacts (suffixed --full) so a fold baseline is never
    // diffed against a full-page candidate of a different height.
    const dir = path.resolve(process.cwd(), BASELINE_DIR);
    const file = path.join(
      dir,
      `${sanitizeBaselineName(tag)}--${target}${fullPage ? "--full" : ""}.png`,
    );
    let baselineBytes: Buffer;
    try {
      baselineBytes = await readFile(file);
    } catch {
      const available = await listBaselines(dir);
      throw new BrowserToolError(
        `No ${fullPage ? "full-page " : ""}baseline named "${tag}" exists for ` +
          `viewport "${target}". ` +
          (available.length > 0
            ? `Saved baselines: ${available.join(", ")}. `
            : "No baselines have been saved yet. ") +
          'Create one first with compare_to_baseline (action "set_baseline"' +
          `${fullPage ? ", fullPage: true" : ""}).`,
      );
    }

    const capture = await rawScreenshot(page, fullPage);
    const current = capture.png;
    const baselineImg = PNG.sync.read(baselineBytes);
    const candidate = PNG.sync.read(current);
    const width = Math.max(baselineImg.width, candidate.width);
    const height = Math.max(baselineImg.height, candidate.height);
    const a = padToCanvas(baselineImg, width, height);
    const b = padToCanvas(candidate, width, height);

    // Pass 1: a transparent-background mask of just the changed pixels.
    const maskPng = new PNG({ width, height });
    const diffPixels = pixelmatch(a.data, b.data, maskPng.data, width, height, {
      threshold: DIFF_THRESHOLD,
      includeAA: false,
      diffMask: true,
    });
    const mask = new Uint8Array(width * height);
    for (let p = 0; p < mask.length; p++) {
      if (maskPng.data[p * 4 + 3]! > 0) mask[p] = 1;
    }

    const regions = clusterDiffMask(mask, width, height, {
      minPixels: 64,
      minSide: 6,
      maxRegions: MAX_REGIONS,
    });

    // Map region centers (device px) → CSS px and hit-test the live DOM.
    const dsf = deviceScaleFactor();
    const curCssW = candidate.width / dsf;
    const curCssH = candidate.height / dsf;
    const kept = regions
      .map((r) => ({
        r,
        cx: (r.x0 + r.x1) / 2 / dsf,
        cy: (r.y0 + r.y1) / 2 / dsf,
      }))
      .filter((k) => k.cx >= 0 && k.cy >= 0 && k.cx < curCssW && k.cy < curCssH);

    let hits: Array<
      | { selector: string; label: string; tag: string; box: { x: number; y: number; width: number; height: number } }
      | null
    > = [];
    if (kept.length > 0) {
      hits = await page.evaluate(
        hitTestInPage,
        kept.map((k) => ({ cx: k.cx, cy: k.cy })),
      );
    }

    // Merge regions that resolve to the same element.
    const bySelector = new Map<string, DiffRegion>();
    let unmapped = regions.length - kept.length;
    kept.forEach((k, i) => {
      const hit = hits[i];
      if (!hit) {
        unmapped++;
        return;
      }
      const existing = bySelector.get(hit.selector);
      if (existing) {
        existing.changedPx += k.r.pixels;
      } else {
        bySelector.set(hit.selector, {
          selector: hit.selector,
          label: hit.label,
          tag: hit.tag,
          box: hit.box,
          changedPx: k.r.pixels,
        });
      }
    });
    const mappedRegions = [...bySelector.values()].sort(
      (x, y) => y.changedPx - x.changedPx,
    );

    // Save a human-viewable delta overlay (red over faded grayscale).
    await mkdir(dir, { recursive: true }).catch(() => undefined);
    const overlayPng = new PNG({ width, height });
    pixelmatch(a.data, b.data, overlayPng.data, width, height, {
      threshold: DIFF_THRESHOLD,
      includeAA: false,
      alpha: 0.1,
      diffColor: [255, 32, 32],
    });
    const overlayImage = await session.encoder.encode(PNG.sync.write(overlayPng), {
      format: "webp",
      quality: 75,
    });
    const run = await session.store.newRun(page.url());
    const savedOverlay = await session.store.saveShot(
      {
        tool: "baseline-diff",
        viewport: target,
        url: page.url(),
        fragment: sanitizeBaselineName(tag),
        annotated: false,
        issueCount: null,
      },
      overlayImage,
    );
    const galleryPath = await session.store.writeGallery();

    const totalPixels = width * height;
    const result: VisualDiffRegionResult = {
      tag,
      fullPage,
      variancePct: Number(((diffPixels / totalPixels) * 100).toFixed(3)),
      diffPixels,
      totalPixels,
      baselineSize: { width: baselineImg.width, height: baselineImg.height },
      currentSize: { width: candidate.width, height: candidate.height },
      regions: mappedRegions,
      unmappedRegions: unmapped,
      overlayFile: savedOverlay.file,
      ...(capture.truncatedToPx !== undefined
        ? { truncatedToPx: capture.truncatedToPx, documentHeightPx: capture.documentHeightPx }
        : {}),
    };
    return {
      result,
      viewport: target,
      run,
      galleryPath,
      health: await session.core.drainHealth(),
    };
  });
}

async function listBaselines(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith(".png"))
      .map((f) => f.replace(/\.png$/, ""))
      .sort();
  } catch {
    return [];
  }
}
