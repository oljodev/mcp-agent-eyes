/**
 * findChromeBinary — locate a REAL Chrome/Chromium/Edge for managed mode.
 *
 * Resolution: an explicit path (from $AGENT_EYES_CHROME_PATH or
 * settings.browser.chromePath, already folded into config.chromePath) →
 * per-OS candidate locations → $PATH. We deliberately prefer real
 * Chrome/Chromium/Edge over Playwright's "Chrome for Testing": Google blocks
 * sign-in on that build and Cloudflare flags it, which defeats the whole point
 * of managed mode. The Chrome-for-Testing binary lives in Playwright's cache,
 * not in any of these candidate paths, so it is never auto-selected.
 */

import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

import { BrowserToolError } from "./errors.js";

/** Resolve the Chrome executable, or throw a clear, actionable error. */
export function findChromeBinary(explicit: string | null): string {
  if (explicit) {
    if (existsSync(explicit)) {
      return explicit;
    }
    throw new BrowserToolError(
      `Chrome path "${explicit}" does not exist. Fix browser.chromePath in ` +
        ".agent-eyes/settings.json (or $AGENT_EYES_CHROME_PATH), or set it to " +
        '"auto" to auto-detect.',
    );
  }
  const candidates = chromeCandidates();
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  const onPath = findOnPath(pathNames());
  if (onPath) {
    return onPath;
  }
  throw new BrowserToolError(
    "Managed browser mode could not find Google Chrome / Chromium / Edge. " +
      'Install one, or set browser.chromePath in .agent-eyes/settings.json to its ' +
      "executable (or browser.mode to \"headless\" for the built-in browser). " +
      `Looked in: ${candidates.slice(0, 6).join(", ")} and on $PATH.`,
  );
}

function chromeCandidates(): string[] {
  switch (process.platform) {
    case "darwin":
      return [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ];
    case "win32": {
      const roots = [
        process.env["PROGRAMFILES"],
        process.env["PROGRAMFILES(X86)"],
        process.env["LOCALAPPDATA"],
      ].filter((r): r is string => Boolean(r));
      const chrome = roots.map((r) =>
        join(r, "Google", "Chrome", "Application", "chrome.exe"),
      );
      const edge = roots.map((r) =>
        join(r, "Microsoft", "Edge", "Application", "msedge.exe"),
      );
      return [...chrome, ...edge];
    }
    default:
      return [
        "/opt/google/chrome/chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
        "/usr/bin/microsoft-edge",
        // flatpak wrapper scripts (forward args via `flatpak run`).
        "/var/lib/flatpak/exports/bin/com.google.Chrome",
        join(process.env["HOME"] ?? "", ".local/share/flatpak/exports/bin/com.google.Chrome"),
      ];
  }
}

function pathNames(): string[] {
  return process.platform === "win32"
    ? ["chrome.exe", "msedge.exe"]
    : [
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "chrome",
      ];
}

function findOnPath(names: string[]): string | null {
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
