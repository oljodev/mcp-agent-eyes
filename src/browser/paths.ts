/**
 * Filesystem-naming helpers for the persistence layer: slugs, run numbers,
 * shot folder labels, and the per-shot info.txt writer.
 */

import { access, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EncodedImage } from "../types/images.js";
import {
  SCREENSHOT_BASENAME,
  SHOT_INFO_FILENAME,
  type PersistingTool,
  type SavedShot,
} from "../types/persistence.js";
import { VIEWPORTS } from "../types/viewports.js";

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "x"
  );
}

export function extensionOf(mimeType: EncodedImage["mimeType"]): string {
  switch (mimeType) {
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
  }
}

/** Reverse of extensionOf, for info.txt display. */
export function mimeFromPath(file: string): EncodedImage["mimeType"] {
  if (file.endsWith(".png")) {
    return "image/png";
  }
  if (file.endsWith(".jpg")) {
    return "image/jpeg";
  }
  return "image/webp";
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** "2026-06-12 13:26:05" — human-readable, for info.txt. */
export function humanTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** The integer N from a `run-N-<page>` id, or -1 for legacy/timestamp dirs. */
export function runNumber(id: string): number {
  // Legacy timestamp dirs look like `run-2026-06-12T13-26-05` — reject those
  // explicitly so they don't parse as run #2026. Everything else is
  // `run-<N>-<page-slug>`, and the page slug may legitimately START WITH A
  // DIGIT (e.g. the URL /2024 → slug "2024" → dir "run-1-2024"); the old
  // `(?=\D)` lookahead wrongly rejected those, freezing the counter.
  if (/^run-\d{4}-\d{2}-\d{2}T/.test(id)) {
    return -1;
  }
  const n = id.match(/^run-(\d+)(?:-|$)/)?.[1];
  return n ? parseInt(n, 10) : -1;
}

/** First capture group of a regex match against a string, or null. */
function firstGroup(re: RegExp, value: string): string | null {
  return value.match(re)?.[1] ?? null;
}

/** Next sequential run number = highest existing `run-N` + 1 (1 if none). */
export async function nextRunNumber(capturesRoot: string): Promise<number> {
  try {
    const entries = await readdir(capturesRoot, { withFileTypes: true });
    let max = 0;
    for (const e of entries) {
      if (e.isDirectory()) {
        max = Math.max(max, runNumber(e.name));
      }
    }
    return max + 1;
  } catch {
    return 1;
  }
}

/** Short page hint for a run folder: "/" → "home", "/pricing" → "pricing". */
export function pageSlugFromUrl(url: string): string {
  let pathname = "/";
  try {
    pathname = new URL(url).pathname;
  } catch {
    /* keep default */
  }
  const seg = pathname.split("/").filter(Boolean).pop();
  if (!seg) {
    return "home";
  }
  const slug = slugify(seg.replace(/\.[a-z0-9]+$/i, ""));
  return (slug && slug !== "x" ? slug : "home").slice(0, 16);
}

/** Friendly target token parsed from a CSS selector, for interaction labels. */
function targetFromSelector(selector: string): string {
  const aria = firstGroup(/aria-label=["']?([^"'\]]+)/i, selector);
  if (aria) {
    return slugify(aria);
  }
  const name = firstGroup(/name=["']?([^"'\]]+)/i, selector);
  if (name) {
    return slugify(name);
  }
  const id = firstGroup(/#([A-Za-z0-9_-]+)/, selector);
  if (id) {
    return slugify(id);
  }
  const cls = firstGroup(/\.([A-Za-z0-9_-]+)/, selector);
  if (cls) {
    return slugify(cls);
  }
  const tag = firstGroup(/^\s*([a-zA-Z][a-zA-Z0-9]*)/, selector);
  if (tag) {
    const t = tag.toLowerCase();
    return t === "body" || t === "html" ? "page" : t;
  }
  return "";
}

/** "click-toggle-navigation", "type-email", "scroll-down-page". */
export function interactionLabel(
  action: string,
  selector: string | undefined,
): string {
  const act = action.replace(/_/g, "-");
  const target = selector ? targetFromSelector(selector) : null;
  return target ? `${act}-${target}` : act;
}

/** Friendly folder tag for a shot, derived from its tool + qualifier. */
export function shotLabel(meta: {
  tool: PersistingTool;
  fragment: string | null;
  annotated: boolean;
}): string {
  const frag = meta.fragment ? slugify(meta.fragment) : "";
  let base: string;
  switch (meta.tool) {
    case "capture":
      base = frag ? `screenshot-${frag}` : "screenshot";
      break;
    case "matrix":
      base = frag ? `responsive-${frag}` : "responsive";
      break;
    case "layout":
      base = "audit";
      break;
    case "interact":
      base = frag || "interact";
      break;
    case "baseline-diff":
      base = frag ? `diff-${frag}` : "diff";
      break;
    case "element":
      base = frag ? `element-${frag}` : "element";
      break;
    case "marks":
      base = "marks";
      break;
  }
  return meta.annotated ? `${base}-annotated` : base;
}

/** One-line human description of a shot's purpose, for info.txt. */
function describeShot(shot: SavedShot): string {
  switch (shot.tool) {
    case "capture":
      return shot.fragment === "fullpage" ? "Full-page screenshot" : "Screenshot";
    case "matrix":
      return "Responsive screenshot";
    case "layout":
      return shot.annotated ? "Layout audit (annotated overlay)" : "Layout audit";
    case "interact":
      return "Interaction";
    case "baseline-diff":
      return "Baseline diff";
    case "element":
      return "Element crop";
    case "marks":
      return "Interactive map (numbered overlay)";
  }
}

/** Write the short, human-readable info.txt next to a shot's image. */
export async function writeShotInfo(
  shotDir: string,
  shot: SavedShot,
): Promise<void> {
  const size = VIEWPORTS[shot.viewport];
  const lines = [
    `${describeShot(shot)} — ${shot.viewport} (${size.width}×${size.height})`,
    `URL:    ${shot.url}`,
    `Time:   ${humanTime(new Date(shot.timestamp))}`,
  ];
  if (shot.fragment && shot.tool !== "capture" && shot.tool !== "matrix") {
    lines.push(`Detail: ${shot.fragment}`);
  }
  if (shot.issueCount !== null) {
    lines.push(
      `Result: ${
        shot.issueCount === 0
          ? "clean — no layout issues"
          : `${shot.issueCount} layout issue${shot.issueCount === 1 ? "" : "s"}`
      }`,
    );
  }
  lines.push(
    `Image:  ${SCREENSHOT_BASENAME}.${extensionOf(
      mimeFromPath(shot.file),
    )} (${shot.width}×${shot.height}, ${Math.max(1, Math.round(shot.bytes / 1024))} KB)`,
  );
  const file = path.join(shotDir, SHOT_INFO_FILENAME);
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, `${lines.join("\n")}\n`);
  await rename(tmp, file);
}
