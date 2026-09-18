/**
 * Persistence model: run directories, manifests, saved-shot metadata, and the
 * gallery contact sheet.
 */

import type { ViewportName } from "./viewports.js";

/** Root of all agent-eyes state, relative to the server's cwd. */
export const AGENT_EYES_DIR = ".agent-eyes";

/** Subdirectory (under AGENT_EYES_DIR) holding run-grouped captures. */
export const CAPTURES_DIRNAME = "captures";

/**
 * Per-run metadata file consumed by the gallery generator. Dot-prefixed so it
 * stays out of the way when a human browses a run folder full of shot folders.
 */
export const RUN_MANIFEST_FILENAME = ".manifest.json";

/** The contact-sheet file, generated at AGENT_EYES_DIR/gallery.html. */
export const GALLERY_FILENAME = "gallery.html";

/** Image filename inside each per-shot folder (extension added per encoding). */
export const SCREENSHOT_BASENAME = "screenshot";

/** Human-readable, one-shot description file inside each per-shot folder. */
export const SHOT_INFO_FILENAME = "info.txt";

/** Tools that persist screenshots, as recorded in manifests/filenames. */
export type PersistingTool =
  | "capture"
  | "matrix"
  | "interact"
  | "layout"
  | "baseline-diff"
  | "element"
  | "marks";

/** One image saved to disk, with the metadata shown in the gallery. */
export interface SavedShot {
  /** Absolute path of the saved image (inside its per-shot folder). */
  file: string;
  /** 1-based position of this shot within its run (the NN in the folder name). */
  index: number;
  /** Friendly tag used in the shot folder name, e.g. "audit-annotated", "type-email". */
  label: string;
  tool: PersistingTool;
  viewport: ViewportName;
  /** Page URL at the moment of capture. */
  url: string;
  /** Action/selector fragment (interactions) or other qualifier, if any. */
  fragment: string | null;
  /** ISO timestamp of the save. */
  timestamp: string;
  /** True for issue-overlay (red outline) renders. */
  annotated: boolean;
  /** Layout-issue count for this render state, when a scan accompanied it. */
  issueCount: number | null;
  width: number;
  height: number;
  bytes: number;
}

/** A run directory: one tool turn, or a chain of consecutive interactions. */
export interface RunInfo {
  /** e.g. "run-2026-06-12T13-26-05" */
  id: string;
  /** Absolute path of the run directory. */
  dir: string;
}
