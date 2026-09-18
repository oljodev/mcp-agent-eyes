/**
 * Centralized, declarative runtime config for agent-eyes — the single foundation
 * every part of the engine reads from. It is designed so a settings UI can bind
 * 1:1 onto the canonical file `.agent-eyes/settings.json`:
 *
 *   browser.mode        "managed" | "headless" | "headed" | "cdp"   (default managed)
 *   browser.chromePath  "auto" (detect) | absolute path
 *   browser.profileDir  null (=> ~/.agent-eyes/chrome-profile) | path
 *   browser.cdpUrl      only for mode "cdp"
 *   browser.keepAlive   leave managed Chrome running between sessions
 *   browser.headless    managed mode: run Chrome with NO visible window
 *                       (--headless=new). DEFAULT true — the window only ever
 *                       appears when await_human_interaction needs a human.
 *   browser.visibility  "on-demand" (window only for human handoff) | "always"
 *   browser.extraFlags  extra Chrome flags
 *   tabs.maxOpen        hard cap on concurrent named tabs
 *   captures.thumbnailMaxWidth  (reserved; wired later)
 *
 * Resolution: `$AGENT_EYES_CONFIG` → `.agent-eyes/settings.json` →
 * `.agent-eyes/config.json` (legacy flat back-compat). The file is zod-validated;
 * an invalid file never throws — it warns to stderr and falls back to defaults.
 * Environment variables still override file values. Read LAZILY (per launch) so a
 * host/test that sets env before the first tool call is honoured.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { z } from "zod";

import { AGENT_EYES_DIR } from "./types/persistence.js";

export type BrowserMode = "headless" | "headed" | "cdp" | "managed";
export type Visibility = "on-demand" | "always";

/** Resolved browser config the engine consumes (env + file already folded in). */
export interface BrowserConfig {
  mode: BrowserMode;
  /** CDP endpoint for mode "cdp"; null otherwise. */
  cdpUrl: string | null;
  /** Explicit Chrome executable, or null to auto-detect. */
  chromePath: string | null;
  /** Absolute persistent user-data-dir for managed Chrome. */
  profileDir: string;
  /** Leave managed Chrome running on shutdown for a warm reconnect. */
  keepalive: boolean;
  /**
   * Managed mode only: launch Chrome with no visible window (--headless=new),
   * keeping the real-Chrome fingerprint and the persistent (logged-in) profile.
   * Default TRUE: routine work never pops a window in the human's face.
   * await_human_interaction relaunches the same profile WITH a window on
   * demand, so a handoff still works — see BrowserCore.ensureVisibleBrowser().
   */
  headless: boolean;
  /** Extra command-line flags for managed Chrome. */
  extraFlags: string[];
  /** Window-raising policy: on-demand (handoff only) or always foreground. */
  visibility: Visibility;
}

export interface Settings {
  browser: BrowserConfig;
  tabs: { maxOpen: number };
  captures: { thumbnailMaxWidth: number };
}

// --- file schema (canonical, nested) ----------------------------------------

const BrowserFileSchema = z
  .object({
    mode: z.enum(["managed", "headless", "headed", "cdp"]).default("managed"),
    chromePath: z.string().default("auto"),
    profileDir: z.string().nullable().default(null),
    cdpUrl: z.string().nullable().default(null),
    keepAlive: z.boolean().default(true),
    headless: z.boolean().default(true),
    visibility: z.enum(["on-demand", "always"]).default("on-demand"),
    extraFlags: z.array(z.string()).default([]),
  })
  .default({});

const SettingsFileSchema = z.object({
  browser: BrowserFileSchema,
  tabs: z
    .object({ maxOpen: z.number().int().positive().max(64).default(8) })
    .default({}),
  captures: z
    .object({ thumbnailMaxWidth: z.number().int().positive().default(1024) })
    .default({}),
});

type SettingsFile = z.infer<typeof SettingsFileSchema>;

let invalidFileWarned = false;

function settingsRoot(): string {
  return resolve(process.cwd(), AGENT_EYES_DIR);
}

/** Path of the settings file in effect, or null when none exists yet. */
function settingsFilePath(): string | null {
  const explicit = process.env.AGENT_EYES_CONFIG?.trim();
  const candidates = explicit
    ? [explicit]
    : [join(settingsRoot(), "settings.json"), join(settingsRoot(), "config.json")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Map a legacy FLAT config.json onto the nested shape; pass nested through. */
function normalizeRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const o = raw as Record<string, unknown>;
  if ("browser" in o || "tabs" in o || "captures" in o) {
    return o; // already the canonical nested shape
  }
  const browser: Record<string, unknown> = {};
  if (typeof o["mode"] === "string") browser["mode"] = o["mode"];
  else if (o["headed"] === true) browser["mode"] = "headed";
  if (typeof o["cdpUrl"] === "string") browser["cdpUrl"] = o["cdpUrl"];
  if (typeof o["chromePath"] === "string") browser["chromePath"] = o["chromePath"];
  if (typeof o["profileDir"] === "string") browser["profileDir"] = o["profileDir"];
  if (typeof o["keepalive"] === "boolean") browser["keepAlive"] = o["keepalive"];
  if (Array.isArray(o["extraFlags"])) browser["extraFlags"] = o["extraFlags"];
  return { browser };
}

function loadSettingsFile(): SettingsFile {
  const path = settingsFilePath();
  if (!path) {
    return SettingsFileSchema.parse({});
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    warnInvalid(`could not read ${path}`);
    return SettingsFileSchema.parse({});
  }
  const parsed = SettingsFileSchema.safeParse(normalizeRaw(raw));
  if (!parsed.success) {
    warnInvalid(`${path}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    return SettingsFileSchema.parse({});
  }
  return parsed.data;
}

function warnInvalid(detail: string): void {
  if (invalidFileWarned) {
    return;
  }
  invalidFileWarned = true;
  console.error(`agent-eyes: ignoring invalid settings (${detail}); using defaults`);
}

// --- env overrides + resolution ---------------------------------------------

function defaultProfileDir(): string {
  return join(homedir(), ".agent-eyes", "chrome-profile");
}

function resolveMode(fileMode: BrowserMode, hasEnvCdp: boolean): BrowserMode {
  if (hasEnvCdp) {
    return "cdp"; // explicit attach endpoint wins
  }
  const env = process.env.AGENT_EYES_BROWSER?.trim().toLowerCase();
  if (env === "managed" || env === "headless" || env === "headed" || env === "cdp") {
    return env;
  }
  if (process.env.AGENT_EYES_HEADED === "1") {
    return "headed";
  }
  return fileMode;
}

function resolveBrowser(fb: SettingsFile["browser"]): BrowserConfig {
  const envCdp = process.env.AGENT_EYES_CDP_URL?.trim();
  const cdpUrl = envCdp || fb.cdpUrl || null;
  const mode = resolveMode(fb.mode, Boolean(envCdp));

  const explicitPath =
    process.env.AGENT_EYES_CHROME_PATH?.trim() ||
    (fb.chromePath && fb.chromePath !== "auto" ? fb.chromePath : "");
  const chromePath = explicitPath || null;

  const profileDir =
    process.env.AGENT_EYES_PROFILE_DIR?.trim() || fb.profileDir || defaultProfileDir();

  const envKeep = (process.env.AGENT_EYES_CHROME_KEEPALIVE ?? "").toLowerCase();
  const keepalive = envKeep === "false" ? false : envKeep === "true" ? true : fb.keepAlive;

  const envHeadless = (process.env.AGENT_EYES_HEADLESS ?? "").toLowerCase();
  const headless =
    envHeadless === "true" || envHeadless === "1"
      ? true
      : envHeadless === "false" || envHeadless === "0"
        ? false
        : fb.headless;

  const envFlags = (process.env.AGENT_EYES_CHROME_FLAGS?.trim() || "")
    .split(/\s+/)
    .filter(Boolean);
  const extraFlags = envFlags.length ? envFlags : fb.extraFlags;

  const envVis = process.env.AGENT_EYES_VISIBILITY?.trim().toLowerCase();
  const visibility: Visibility =
    envVis === "always" || envVis === "on-demand" ? envVis : fb.visibility;

  return {
    mode,
    cdpUrl,
    chromePath,
    profileDir,
    keepalive,
    // visibility "always" means "keep the window foregrounded" — that only has
    // meaning if there IS a window, so it necessarily implies a visible launch.
    headless: visibility === "always" ? false : headless,
    extraFlags,
    visibility,
  };
}

/** Full resolved settings (browser + tabs + captures). */
export function readSettings(): Settings {
  const file = loadSettingsFile();
  return {
    browser: resolveBrowser(file.browser),
    tabs: file.tabs,
    captures: file.captures,
  };
}

/** Resolved browser config — the hot path used on every browser acquire. */
export function readBrowserConfig(): BrowserConfig {
  return resolveBrowser(loadSettingsFile().browser);
}

/** The canonical settings file path (.agent-eyes/settings.json under cwd). */
export function settingsJsonPath(): string {
  return join(settingsRoot(), "settings.json");
}

/** The settings/config file currently in effect, or null when none exists. */
export function currentSettingsFile(): string | null {
  return settingsFilePath();
}

/** A fully-populated default settings object (every key at its default value). */
export function defaultSettingsObject(): SettingsFile {
  return SettingsFileSchema.parse({});
}

/** Write a settings object to .agent-eyes/settings.json atomically (tmp→rename). */
export function writeSettingsFile(data: unknown): string {
  const root = settingsRoot();
  mkdirSync(root, { recursive: true });
  const file = settingsJsonPath();
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, file);
  return file;
}

/**
 * Auto-create a fully-populated `.agent-eyes/settings.json` on first run when no
 * settings/config file exists yet. Self-documenting (every key written at its
 * default), atomic (tmp→rename), and intentionally NOT gitignored — it holds no
 * secrets, so teams can commit and share it. Best-effort: never throws.
 */
export function ensureSettingsFile(): void {
  if (settingsFilePath()) {
    return; // a settings.json or legacy config.json already exists
  }
  try {
    const file = writeSettingsFile(defaultSettingsObject());
    console.error(`agent-eyes: wrote default settings to ${file}`);
  } catch (error) {
    console.error(
      `agent-eyes: could not write default settings.json (${String(error)}); using defaults`,
    );
  }
}
