/** compare_to_baseline operation (save / diff) + its filesystem helpers. */

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError } from "../browser/errors.js";
import { navigateIfNeeded, resetScroll } from "../browser/navigation.js";
import { padToCanvas, pngDimensions } from "../browser/image-utils.js";
import { rawScreenshot, rawViewportScreenshot } from "../browser/screenshot.js";
import {
  BASELINE_DIR,
  DIFF_THRESHOLD,
  type BaselineAction,
  type BaselineResult,
} from "../types/baselines.js";
import type { PageHealth } from "../types/health.js";
import type { RunInfo, SavedShot } from "../types/persistence.js";
import type { ViewportName } from "../types/viewports.js";

/** Save the current render as a baseline, or diff against a saved one. */
export function baseline(
  session: BrowserSession,
  url: string,
  viewport: ViewportName,
  action: BaselineAction,
  name: string,
  fullPage: boolean,
  reload = false,
): Promise<{
  result: BaselineResult;
  savedDiff: SavedShot | null;
  run: RunInfo | null;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const page = await session.core.ensurePage(viewport);
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });

    // Prior interactions (e.g. scroll_down) leave the page scrolled
    // mid-document; a baseline captured at the top fold would then diff
    // against a misaligned candidate. Pin the scroll position to (0,0)
    // before EVERY baseline save or comparison so frames always align.
    await resetScroll(page);

    // Baselines are always lossless PNGs: lossy artifacts would show up
    // as phantom diffs. Viewport-fold by default; fullPage captures the
    // entire scrollable height (clipped at the model-safe cap) so
    // regressions below the fold aren't blind spots.
    const current = fullPage
      ? (await rawScreenshot(page, true)).png
      : await rawViewportScreenshot(page);

    const dir = path.resolve(process.cwd(), BASELINE_DIR);
    await mkdir(dir, { recursive: true });
    // fullPage baselines are distinct artifacts from fold baselines —
    // suffix the filename so the two never collide.
    const file = path.join(
      dir,
      `${sanitizeBaselineName(name)}--${viewport}${fullPage ? "--full" : ""}.png`,
    );

    if (action === "set_baseline") {
      // Write-then-rename so a crash mid-write never corrupts a baseline.
      const tmp = `${file}.tmp-${process.pid}`;
      await writeFile(tmp, current);
      await rename(tmp, file);
      const dims = pngDimensions(current);
      return {
        result: {
          action,
          file,
          fullPage,
          width: dims.width,
          height: dims.height,
          bytes: current.length,
        },
        savedDiff: null,
        run: null,
        health: await session.core.drainHealth(),
      };
    }

    let baselineBytes: Buffer;
    try {
      baselineBytes = await readFile(file);
    } catch {
      const available = await listBaselines(dir);
      throw new BrowserToolError(
        `No ${fullPage ? "full-page " : ""}baseline named "${name}" exists ` +
          `for viewport "${viewport}". ` +
          (available.length > 0
            ? `Saved baselines: ${available.join(", ")}. `
            : "No baselines have been saved yet. ") +
          'Run this tool with action "set_baseline" first' +
          `${fullPage ? " (with fullPage: true — fold and full-page baselines are separate files)" : ""}.`,
      );
    }

    const baselineImg = PNG.sync.read(baselineBytes);
    const candidate = PNG.sync.read(current);
    const width = Math.max(baselineImg.width, candidate.width);
    const height = Math.max(baselineImg.height, candidate.height);
    const a = padToCanvas(baselineImg, width, height);
    const b = padToCanvas(candidate, width, height);

    const diff = new PNG({ width, height });
    const diffPixels = pixelmatch(a.data, b.data, diff.data, width, height, {
      threshold: DIFF_THRESHOLD,
      includeAA: false,
      alpha: 0.2,
      diffColor: [255, 32, 32],
    });

    // The overlay is informational — lossy-encode it to keep tokens low.
    const diffImage = await session.encoder.encode(PNG.sync.write(diff), {
      format: "webp",
      quality: 75,
    });

    // Persist the delta overlay alongside the flow's other captures.
    const run = await session.store.ensureRun(page.url());
    const savedDiff = await session.store.saveShot(
      {
        tool: "baseline-diff",
        viewport,
        url: page.url(),
        fragment: sanitizeBaselineName(name),
        annotated: false,
        issueCount: null,
      },
      diffImage,
    );
    await session.store.writeGallery();

    const totalPixels = width * height;
    return {
      result: {
        action,
        file,
        fullPage,
        diffPixels,
        totalPixels,
        variancePct: Number(((diffPixels / totalPixels) * 100).toFixed(3)),
        baselineSize: { width: baselineImg.width, height: baselineImg.height },
        currentSize: { width: candidate.width, height: candidate.height },
        diffImage,
      },
      savedDiff,
      run,
      health: await session.core.drainHealth(),
    };
  });
}

export function sanitizeBaselineName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!slug) {
    throw new BrowserToolError(
      `"${name}" is not a usable baseline name — use letters, digits, ` +
        "dashes, and underscores.",
    );
  }
  return slug;
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
