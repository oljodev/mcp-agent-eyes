/** generate_audit_gallery operation. */

import path from "node:path";

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError } from "../browser/errors.js";
import { listRuns, readAllShots, readManifest } from "../browser/gallery.js";
import { pathExists } from "../browser/paths.js";

/**
 * (Re)build .agent-eyes/gallery.html for the given run (default: every run
 * aggregated into one sheet). Pure file work — the browser is not touched.
 */
export function generateGallery(
  session: BrowserSession,
  runId?: string,
): Promise<{
  file: string;
  runId: string | null;
  shotCount: number;
  runCount: number;
}> {
  return session.core.runExclusive(async () => {
    const root = session.store.capturesRoot();
    // Explicit run → scope the sheet to just that run.
    if (runId) {
      const dir = path.join(root, runId);
      if (!(await pathExists(dir))) {
        const runs = await listRuns(root);
        throw new BrowserToolError(
          `Run "${runId}" does not exist.` +
            (runs.length > 0
              ? ` Available runs (latest last): ${runs.slice(-10).join(", ")}.`
              : " No runs have been recorded yet."),
        );
      }
      const shots = await readManifest(dir);
      const file = await session.store.writeGallery(runId);
      return { file, runId, shotCount: shots.length, runCount: 1 };
    }
    // Default → aggregate every run into one contact sheet.
    const shots = await readAllShots(root);
    if (shots.length === 0) {
      throw new BrowserToolError(
        "No capture runs exist yet. Use capture_page_screenshot, " +
          "matrix_responsive_audit, interact_and_audit, or an annotated " +
          "detect_layout_matrix first, then generate the gallery.",
      );
    }
    const file = await session.store.writeGallery();
    const runCount = new Set(shots.map((s) => s.runId)).size;
    return { file, runId: null, shotCount: shots.length, runCount };
  });
}
