/**
 * `mcp-agent-eyes update` — the one-command updater, plus the text that tells an
 * agent how to run it. agent-eyes installs straight from GitHub, so "latest" is
 * `main`'s package.json and "update" means: drop the cached copy so the next
 * start rebuilds from the new source.
 *
 * Usage:
 *   mcp-agent-eyes update            update in place (npx cache or git clone)
 *   mcp-agent-eyes update --check    only report whether a newer version exists
 *   mcp-agent-eyes version           print the installed version
 */

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { SERVER_VERSION } from "./version.js";

const REPO = "oljodev/mcp-agent-eyes";
const SPEC = `github:${REPO}`;
const LATEST_URL = `https://raw.githubusercontent.com/${REPO}/main/package.json`;

/** The single command a human or agent runs to update, whatever the install. */
export const UPDATE_COMMAND = `npx -y ${SPEC} update`;

/** Shown to agents via the MCP `instructions` field and the update resource. */
export function updateInstructions(): string {
  return [
    `agent-eyes v${SERVER_VERSION} — how to update`,
    "",
    "Run one command in a terminal:",
    "",
    `  ${UPDATE_COMMAND}`,
    "",
    "It works for npx installs (clears the cached copy and rebuilds from",
    "GitHub) and for git clones (git pull + npm install + build). Then restart",
    "the MCP client so it launches the new server.",
    "",
    `Check without changing anything:  npx -y ${SPEC} update --check`,
    `See what changed:                 https://github.com/${REPO}/blob/main/CHANGELOG.md`,
    "",
    "Every tool response ends with [Metadata: agent-eyes vX.Y.Z]; compare it to",
    "the latest version to know whether an update is available.",
  ].join("\n");
}

/** One-line pointer carried in the MCP server `instructions`. */
export function updateHint(): string {
  return (
    `agent-eyes v${SERVER_VERSION}. To update, run \`${UPDATE_COMMAND}\` in a ` +
    "terminal, then restart the MCP client. Full instructions: resource " +
    "agent-eyes://update."
  );
}

/** -1 / 0 / 1 comparing dotted numeric versions (pre-release tags ignored). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, "")
      .split("-")[0]!
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type InstallKind =
  | { kind: "npx"; cacheDir: string }
  | { kind: "clone" }
  | { kind: "unknown" };

/**
 * Where is this copy running from? An npx run lives under
 * `<cache>/_npx/<hash>/node_modules/…`; the `<hash>` dir is what to remove.
 */
export function detectInstall(packageRoot: string): InstallKind {
  const parts = resolve(packageRoot).split(sep);
  const i = parts.lastIndexOf("_npx");
  if (i >= 0 && parts[i + 1]) {
    return { kind: "npx", cacheDir: parts.slice(0, i + 2).join(sep) || sep };
  }
  if (existsSync(join(packageRoot, ".git"))) {
    return { kind: "clone" };
  }
  return { kind: "unknown" };
}

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(LATEST_URL, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { version?: unknown };
    return typeof json.version === "string" ? json.version : null;
  } catch {
    return null;
  }
}

function run(cmd: string, args: string[], cwd?: string): boolean {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return r.status === 0;
}

function log(line = ""): void {
  console.log(line);
}

/** Entry point for `update` / `version`. Returns the process exit code. */
export async function runUpdate(argv: string[]): Promise<number> {
  const checkOnly = argv.includes("--check");
  const latest = await fetchLatestVersion();

  log(`agent-eyes installed: v${SERVER_VERSION}`);
  if (latest) {
    log(`agent-eyes latest:    v${latest}`);
  } else {
    log("agent-eyes latest:    (could not reach GitHub)");
  }
  const outdated = latest !== null && compareVersions(SERVER_VERSION, latest) < 0;
  if (latest !== null && !outdated && !argv.includes("--force")) {
    log("\nAlready up to date.");
    return 0;
  }
  if (checkOnly) {
    log(outdated ? `\nUpdate available. Run: ${UPDATE_COMMAND}` : "");
    return outdated ? 10 : 0;
  }

  const install = detectInstall(packageRoot());
  if (install.kind === "npx") {
    log(`\nClearing the cached copy: ${install.cacheDir}`);
    try {
      rmSync(install.cacheDir, { recursive: true, force: true });
    } catch (error) {
      log(
        `Could not remove it (${error instanceof Error ? error.message : error}). ` +
          "Close any running agent-eyes server and retry.",
      );
      return 1;
    }
    // Other cached specs of the same package (an old pinned tag) would be
    // stale too, but they are not what the agent config points at.
    log(`Rebuilding from ${SPEC} (this can take a minute)…`);
    if (!run("npx", ["-y", SPEC, "version"])) {
      log(`\nUpdate failed. Retry: ${UPDATE_COMMAND}`);
      return 1;
    }
  } else if (install.kind === "clone") {
    const root = packageRoot();
    log("\nUpdating the git clone…");
    if (
      !run("git", ["pull", "--ff-only"], root) ||
      !run("npm", ["install"], root) ||
      !run("npm", ["run", "build"], root)
    ) {
      log("\nUpdate failed — resolve the error above (local changes?) and retry.");
      return 1;
    }
  } else {
    log(
      "\nCould not tell how agent-eyes was installed. Reinstall with:\n" +
        `  npx -y ${SPEC} setup --agent <your-agent> --write`,
    );
    return 1;
  }

  log("\n✓ Updated. Restart your MCP client so it launches the new version.");
  log(`  Changes: https://github.com/${REPO}/blob/main/CHANGELOG.md`);
  return 0;
}

export function runVersion(): void {
  log(SERVER_VERSION);
}
