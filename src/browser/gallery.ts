/**
 * The .agent-eyes/gallery.html contact sheet: manifest reading, run listing,
 * and the static HTML renderer (thumbnail grid + client-side sorting).
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { RUN_MANIFEST_FILENAME, type SavedShot } from "../types/persistence.js";
import { runNumber } from "./paths.js";

export async function readManifest(runDir: string): Promise<SavedShot[]> {
  try {
    const raw = await readFile(
      path.join(runDir, RUN_MANIFEST_FILENAME),
      "utf8",
    );
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedShot[]) : [];
  } catch {
    return [];
  }
}

export async function listRuns(capturesRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(capturesRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith("run-"))
      .map((e) => e.name)
      // Numeric by run number so run-2 precedes run-10; any legacy timestamp
      // dirs (runNumber === -1) sort to the front as "oldest".
      .sort((a, b) => runNumber(a) - runNumber(b) || a.localeCompare(b));
  } catch {
    return [];
  }
}

export async function latestRunId(capturesRoot: string): Promise<string | null> {
  const runs = await listRuns(capturesRoot);
  return runs[runs.length - 1] ?? null;
}

/** A persisted shot tagged with the run it belongs to, for the gallery. */
export interface GalleryShot extends SavedShot {
  runId: string;
}

/**
 * Every shot across every run, tagged with its run id and ordered newest-run-
 * first (chronological within a run), so the aggregated gallery reads top-to-
 * bottom as "latest work first, grouped by run".
 */
export async function readAllShots(capturesRoot: string): Promise<GalleryShot[]> {
  const runs = await listRuns(capturesRoot); // ascending (oldest first)
  const out: GalleryShot[] = [];
  for (const runId of runs.reverse()) {
    const shots = await readManifest(path.join(capturesRoot, runId));
    for (const shot of shots) {
      out.push({ ...shot, runId });
    }
  }
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The .agent-eyes/gallery.html contact sheet: thumbnail grid + sorting. */
export function renderGalleryHtml(
  heading: string,
  shots: GalleryShot[],
  agentEyesRoot: string,
): string {
  const runCount = new Set(shots.map((s) => s.runId)).size;
  const cards = shots
    .map((shot) => {
      const rel = path.relative(agentEyesRoot, shot.file).split(path.sep).join("/");
      const time = shot.timestamp.slice(11, 19);
      const issues =
        shot.issueCount === null
          ? ""
          : `<span class="badge ${shot.issueCount > 0 ? "bad" : "ok"}">${shot.issueCount} issue${shot.issueCount === 1 ? "" : "s"}</span>`;
      const annotated = shot.annotated
        ? '<span class="badge annotated">annotated</span>'
        : "";
      const fragment = shot.fragment
        ? `<div class="frag">${escapeHtml(shot.fragment)}</div>`
        : "";
      return `    <figure class="card" data-ts="${Date.parse(shot.timestamp)}" data-viewport="${shot.viewport}" data-tool="${shot.tool}" data-issues="${shot.issueCount ?? -1}" data-run="${escapeHtml(shot.runId)}">
      <a href="${escapeHtml(rel)}" target="_blank"><img src="${escapeHtml(rel)}" loading="lazy" alt="${shot.viewport} ${shot.tool}"></a>
      <figcaption>
        <div class="head"><strong>${shot.viewport} · ${escapeHtml(shot.tool)}</strong>${annotated}${issues}</div>
        <div class="url" title="${escapeHtml(shot.url)}">${escapeHtml(shot.url)}</div>
        ${fragment}
        <div class="dims">${shot.width}x${shot.height}px · ${Math.max(1, Math.round(shot.bytes / 1024))} KB · ${time}</div>
        <div class="run">${escapeHtml(shot.runId)}</div>
      </figcaption>
    </figure>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agent-eyes gallery — ${escapeHtml(heading)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.45 system-ui, sans-serif; margin: 0; padding: 1.25rem;
         background: light-dark(#fafafa, #16161a); color: light-dark(#1a1a1a, #e8e8ea); }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: .75rem 1.5rem; margin-bottom: 1rem; }
  h1 { font-size: 1.15rem; margin: 0; }
  .meta { opacity: .65; }
  nav button { font: inherit; padding: .2rem .7rem; border-radius: 999px; cursor: pointer;
               border: 1px solid light-dark(#ccc, #3a3a42); background: light-dark(#fff, #232329);
               color: inherit; }
  nav button.active { border-color: #e0312f; color: #e0312f; }
  #grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 1rem; }
  .card { margin: 0; border: 1px solid light-dark(#ddd, #2c2c33); border-radius: 10px; overflow: hidden;
          background: light-dark(#fff, #1d1d22); display: flex; flex-direction: column; }
  .card a { display: block; background: repeating-conic-gradient(#80808022 0% 25%, transparent 0% 50%) 0 0/16px 16px; }
  .card img { display: block; width: 100%; height: 200px; object-fit: contain; object-position: top; }
  figcaption { padding: .6rem .75rem .75rem; display: grid; gap: .25rem; }
  .head { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
  .badge { font-size: .72rem; padding: .05rem .45rem; border-radius: 999px; border: 1px solid; }
  .badge.annotated { color: #e0312f; border-color: #e0312f; }
  .badge.bad { color: #c47b00; border-color: #c47b00; }
  .badge.ok { color: #2f9e44; border-color: #2f9e44; }
  .url, .frag { font-family: ui-monospace, monospace; font-size: .78rem; opacity: .75;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dims { font-size: .78rem; opacity: .6; }
  .run { font-family: ui-monospace, monospace; font-size: .72rem; opacity: .5;
         overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
</head>
<body>
<header>
  <h1>agent-eyes — ${escapeHtml(heading)}</h1>
  <div class="meta">${shots.length} shot${shots.length === 1 ? "" : "s"} across ${runCount} run${runCount === 1 ? "" : "s"} · generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC</div>
  <nav>
    sort:
    <button data-sort="run" data-desc="1" class="active">run</button>
    <button data-sort="ts" data-numeric="1">time</button>
    <button data-sort="viewport">viewport</button>
    <button data-sort="tool">tool</button>
    <button data-sort="issues" data-numeric="1" data-desc="1">issues</button>
  </nav>
</header>
<main id="grid">
${cards}
</main>
<script>
  const grid = document.getElementById("grid");
  document.querySelectorAll("nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.dataset.sort, numeric = !!btn.dataset.numeric, desc = !!btn.dataset.desc;
      Array.from(grid.children)
        .sort((a, b) => {
          const av = a.dataset[key], bv = b.dataset[key];
          const cmp = numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
          return desc ? -cmp : cmp;
        })
        .forEach((el) => grid.appendChild(el));
    });
  });
</script>
</body>
</html>
`;
}
