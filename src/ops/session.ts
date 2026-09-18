/** manage_session operation (set / clear / save / load) + its helpers. */

import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError } from "../browser/errors.js";
import { pathExists } from "../browser/paths.js";
import type { PageHealth } from "../types/health.js";
import {
  SESSIONS_DIR,
  type ManageSessionInput,
  type SessionCookie,
} from "../types/session.js";
import { sanitizeBaselineName } from "./baseline.js";

/**
 * Auth/session state: set cookies + localStorage seeds + extra headers on the
 * session, clear them, or save/restore a full storageState snapshot to disk
 * by name. All mutations persist on BrowserCore so they survive a
 * crash-rebuilt context. Operates on the live context (lazily created, no
 * navigation) rather than a URL — session state is global, not per-render.
 */
export function manageSession(
  session: BrowserSession,
  input: ManageSessionInput,
): Promise<{ summary: string; health: PageHealth }> {
  return session.core.runExclusive(async () => {
    switch (input.action) {
      case "set":
        return sessionSet(session, input);
      case "clear":
        return sessionClear(session);
      case "save":
        return sessionSave(session, input.name);
      case "load":
        return sessionLoad(session, input.name);
    }
  });
}

async function sessionSet(
  session: BrowserSession,
  input: ManageSessionInput,
): Promise<{ summary: string; health: PageHealth }> {
  const core = session.core;
  const applied: string[] = [];
  let initScript: string | null = null;

  if (input.headers && Object.keys(input.headers).length > 0) {
    core.extraHeaders = { ...core.extraHeaders, ...input.headers };
    applied.push(`${Object.keys(input.headers).length} header(s)`);
  }
  if (input.cookies && input.cookies.length > 0) {
    core.seededCookies = mergeCookies(core.seededCookies, input.cookies);
    applied.push(`${input.cookies.length} cookie(s)`);
  }
  if (input.localStorage && input.localStorage.length > 0) {
    initScript = compileLocalStorageScript(input.localStorage);
    if (!core.initScripts.includes(initScript)) {
      core.initScripts.push(initScript);
    }
    const n = input.localStorage.reduce((s, o) => s + o.items.length, 0);
    applied.push(`${n} localStorage item(s)`);
  }
  if (applied.length === 0) {
    throw new BrowserToolError(
      'manage_session "set" needs at least one of: cookies, localStorage, ' +
        "headers.",
    );
  }

  if (core.context) {
    // Apply to the live context so the agent need not reload for cookies /
    // headers. (Init scripts only affect FUTURE document loads.)
    if (input.headers) {
      await core.context.setExtraHTTPHeaders(core.extraHeaders);
    }
    if (input.cookies) {
      await core.context.addCookies(input.cookies);
    }
    if (initScript) {
      await core.context.addInitScript({ content: initScript });
    }
  } else {
    // No context yet — create one (no navigation); ensurePage's
    // applySessionState replays the fields we just set.
    await core.ensurePage(core.currentViewport ?? "desktop");
  }

  const note = input.localStorage
    ? " localStorage seeds apply on the next navigation/reload."
    : "";
  return {
    summary: `Session updated: ${applied.join(", ")}.${note}`,
    health: await core.drainHealth(),
  };
}

async function sessionClear(
  session: BrowserSession,
): Promise<{ summary: string; health: PageHealth }> {
  const core = session.core;
  core.seededCookies = [];
  core.extraHeaders = {};
  core.initScripts = [];
  core.storageStatePath = null;
  await core.recreateContext();
  return {
    summary:
      "Session cleared (cookies, headers, localStorage seeds, loaded " +
      "state). The context rebuilds clean on the next call.",
    health: await core.drainHealth(),
  };
}

async function sessionSave(
  session: BrowserSession,
  name: string | undefined,
): Promise<{ summary: string; health: PageHealth }> {
  const core = session.core;
  if (!name) {
    throw new BrowserToolError('manage_session "save" requires a "name".');
  }
  if (!core.context) {
    throw new BrowserToolError(
      "No session to save — open a page (and log in) first with " +
        "capture_page_screenshot.",
    );
  }
  const dir = path.resolve(process.cwd(), SESSIONS_DIR);
  await mkdir(dir, { recursive: true });
  await session.store.ensureGitignore();
  const file = path.join(dir, `${sanitizeBaselineName(name)}.json`);
  const state = await core.context.storageState();
  // write-then-rename so a crash never leaves a half-written session file.
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(state));
  await rename(tmp, file);
  return {
    summary:
      `Session "${name}" saved to ${file} ` +
      `(${state.cookies.length} cookie(s), ${state.origins.length} ` +
      "origin(s) with localStorage). Note: this file stores auth tokens in " +
      "plaintext — it is gitignored under .agent-eyes/sessions/.",
    health: await core.drainHealth(),
  };
}

async function sessionLoad(
  session: BrowserSession,
  name: string | undefined,
): Promise<{ summary: string; health: PageHealth }> {
  const core = session.core;
  if (!name) {
    throw new BrowserToolError('manage_session "load" requires a "name".');
  }
  const dir = path.resolve(process.cwd(), SESSIONS_DIR);
  const file = path.join(dir, `${sanitizeBaselineName(name)}.json`);
  if (!(await pathExists(file))) {
    const available = await listSessions(dir);
    throw new BrowserToolError(
      `No saved session named "${name}".` +
        (available.length > 0
          ? ` Available: ${available.join(", ")}.`
          : ' No sessions saved yet — use action "save" first.'),
    );
  }
  // storageState only applies at newContext() time, so stage the path and
  // rebuild the context; the next navigation carries the restored auth.
  core.storageStatePath = file;
  await core.recreateContext();
  return {
    summary:
      `Session "${name}" loaded — the browser context was reset with its ` +
      "cookies + localStorage. Navigate to your app " +
      "(capture_page_screenshot) to use it.",
    health: await core.drainHealth(),
  };
}

/** Saved session-snapshot names under .agent-eyes/sessions/. */
async function listSessions(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/** Merge cookies, replacing any with the same identity (name+domain+path+url). */
function mergeCookies(
  existing: SessionCookie[],
  incoming: SessionCookie[],
): SessionCookie[] {
  const key = (c: SessionCookie) =>
    `${c.name} ${c.domain ?? ""} ${c.path ?? ""} ${c.url ?? ""}`;
  const map = new Map(existing.map((c) => [key(c), c]));
  for (const c of incoming) {
    map.set(key(c), c);
  }
  return [...map.values()];
}

/**
 * Compile localStorage seeds into an init-script source string. It runs before
 * the page's own scripts on every document load, and only touches the matching
 * origin so seeds for app.example.com never leak onto another site.
 */
function compileLocalStorageScript(
  seeds: Array<{ origin: string; items: Array<{ name: string; value: string }> }>,
): string {
  return seeds
    .map((s) => {
      const sets = s.items
        .map(
          (it) =>
            `localStorage.setItem(${JSON.stringify(it.name)}, ${JSON.stringify(it.value)});`,
        )
        .join(" ");
      return `if (location.origin === ${JSON.stringify(s.origin)}) { try { ${sets} } catch (e) {} }`;
    })
    .join("\n");
}
