/** detect_layout_matrix operation. */

import type { BrowserSession } from "../browser/session.js";
import { navigateIfNeeded, applyViewport } from "../browser/navigation.js";
import { countLayoutIssues, runLayoutScan } from "../browser/layout-scan.js";
import type { PageHealth } from "../types/health.js";
import type { LayoutMatrixEntry } from "../types/layout.js";
import type { RunInfo, SavedShot } from "../types/persistence.js";
import { VIEWPORTS, VIEWPORT_NAMES } from "../types/viewports.js";

/**
 * Run the text-only layout scan at every breakpoint in one call. Tap
 * targets are checked on mobile only, where the 44px rule applies. When
 * annotate is true, each breakpoint with findings additionally gets a
 * red-outline overlay render saved to disk (never returned as base64).
 * The previously active viewport is restored afterwards.
 */
export function layoutMatrix(
  session: BrowserSession,
  url: string,
  annotate: boolean,
  reload = false,
  ignoreSelector: string[] = [],
): Promise<{
  entries: LayoutMatrixEntry[];
  run: RunInfo | null;
  galleryPath: string | null;
  health: PageHealth;
}> {
  return session.core.runExclusive(async () => {
    const before = session.core.currentViewport;
    const page = await session.core.ensurePage(before ?? "mobile");
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });

    let run: RunInfo | null = null;
    const entries: LayoutMatrixEntry[] = [];
    for (const viewport of VIEWPORT_NAMES) {
      await applyViewport(session.core, page, viewport);
      const scan = await runLayoutScan(
        page,
        VIEWPORTS[viewport],
        viewport === "mobile",
        ignoreSelector,
      );
      let annotatedShot: SavedShot | null = null;
      if (annotate && countLayoutIssues(scan) > 0) {
        run = run ?? (await session.store.newRun(url));
        annotatedShot = await session.store.annotateAndSave(
          page,
          scan,
          viewport,
          session.encoder,
        );
      }
      entries.push({
        viewport,
        size: VIEWPORTS[viewport],
        scan,
        annotatedShot,
      });
    }
    if (before !== null) {
      await applyViewport(session.core, page, before);
    }
    const galleryPath = run ? await session.store.writeGallery() : null;
    return {
      entries,
      run,
      galleryPath,
      health: await session.core.drainHealth(),
    };
  });
}
