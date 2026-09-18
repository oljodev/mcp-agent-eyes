/**
 * `mcp-agent-eyes setup` — the one-command 1.0 onboarding. It detects a real
 * Chrome, writes a tuned `.agent-eyes/settings.json`, and prints (or, with
 * --write, merges) the MCP server config snippet for the user's agent. No new
 * dependencies; cross-platform; safe by default (print-only, backups on write).
 *
 * Usage:
 *   mcp-agent-eyes setup [--agent claude-code|cursor|codex|zed|vscode]
 *                        [--force] [--write]
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  currentSettingsFile,
  defaultSettingsObject,
  settingsJsonPath,
  writeSettingsFile,
} from "./config.js";
import { findChromeBinary } from "./browser/find-chrome.js";
import { SERVER_VERSION } from "./version.js";

interface Flags {
  agent: string | null;
  force: boolean;
  write: boolean;
}

interface AgentSpec {
  id: string;
  name: string;
  /** Human-readable config location for the printed instructions. */
  location: string;
  format: "json" | "toml";
  /** The top-level key the server entry nests under (JSON agents). */
  mergeKey?: "mcpServers" | "servers" | "context_servers";
  /** Absolute path used by --write (JSON agents only). */
  writeTarget?: string;
  /** The object to place under mergeKey["agent-eyes"]. */
  entry(cmd: string, args: string[]): Record<string, unknown>;
  /** The printable snippet. */
  snippet(cmd: string, args: string[]): string;
}

export async function runSetup(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  log(`agent-eyes setup (v${SERVER_VERSION})\n`);

  // 1) Detect Chrome.
  let chromePath: string | null = null;
  try {
    chromePath = findChromeBinary(null);
    log(`✓ Found Chrome: ${chromePath}`);
  } catch {
    log(
      "! No Chrome/Chromium/Edge found. Managed mode needs one — install Google " +
        "Chrome, or set browser.chromePath later. Falling back to chromePath: \"auto\".",
    );
  }

  // 2) Write settings.json (don't clobber without --force).
  const existing = currentSettingsFile();
  const settingsTarget = settingsJsonPath();
  if (existing && !flags.force) {
    log(`✓ Settings already present: ${existing} (use --force to overwrite)`);
  } else {
    const settings = defaultSettingsObject();
    settings.browser.mode = "managed";
    settings.browser.visibility = "on-demand";
    settings.browser.chromePath = chromePath ?? "auto";
    const written = writeSettingsFile(settings);
    log(`✓ Wrote ${written} (mode: managed, chromePath: ${settings.browser.chromePath})`);
  }

  // 3) MCP server config snippets.
  const { cmd, args } = serverCommand();
  const agents = flags.agent
    ? AGENTS.filter((a) => a.id === flags.agent)
    : AGENTS;
  if (flags.agent && agents.length === 0) {
    log(`\n! Unknown --agent "${flags.agent}". Known: ${AGENTS.map((a) => a.id).join(", ")}`);
    return;
  }

  log("\nMCP server config:");
  for (const agent of agents) {
    log(`\n── ${agent.name} ──`);
    log(`  config file: ${agent.location}`);
    if (flags.write) {
      writeAgentConfig(agent, cmd, args);
    } else {
      log(indent(agent.snippet(cmd, args)));
    }
  }

  // 4) Ready summary.
  const primary = flags.agent ?? "claude-code";
  log("\nYou're ready:");
  log(`  1. ${flags.write ? "Config written above (restart your agent)." : "Add the snippet above to your agent's MCP config."}`);
  log("  2. Restart your agent so it picks up agent-eyes.");
  log(
    `  3. First use starts a real Chrome INVISIBLY — no window pops up. A window ` +
      `only appears when await_human_interaction hands the browser to you (log ` +
      `in there once; the profile persists). Set browser.headless: false in ` +
      `settings.json to see the window from the start. ` +
      `(setup --agent ${primary} prints just one snippet.)`,
  );
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { agent: null, force: false, write: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") flags.force = true;
    else if (a === "--write") flags.write = true;
    else if (a === "--agent") flags.agent = (argv[++i] ?? "").toLowerCase() || null;
    else if (a?.startsWith("--agent=")) flags.agent = a.slice("--agent=".length).toLowerCase();
  }
  return flags;
}

/** The command + args that launch THIS server, reliable for local or packaged. */
function serverCommand(): { cmd: string; args: string[] } {
  const script = process.argv[1] ? resolve(process.argv[1]) : "";
  const packaged = script.includes(`${join("node_modules", "")}`) || script.endsWith(join(".bin", "mcp-agent-eyes"));
  if (packaged) {
    return { cmd: "npx", args: ["-y", installedSpec()] };
  }
  // Local clone: node + the absolute path to this very entry point (always works).
  return { cmd: process.execPath, args: [script] };
}

/**
 * The package spec this copy was installed from — normally "mcp-agent-eyes",
 * but npx can be pointed at ANY spec: a git URL (`github:owner/repo`) before a
 * release lands, a fork, or a pinned version. The config we hand the user has
 * to name the spec that ACTUALLY installed, or their agent starts a server that
 * cannot be fetched. npx records what it was asked for in its cache root's
 * package.json (`_npx.packages`), so walk up and read it back.
 */
function installedSpec(): string {
  const fallback = "mcp-agent-eyes";
  let dir = dirname(process.argv[1] ? resolve(process.argv[1]) : "");
  for (let depth = 0; depth < 8 && dir !== dirname(dir); depth += 1, dir = dirname(dir)) {
    let specs: string[] | undefined;
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        _npx?: { packages?: string[] };
      };
      specs = pkg._npx?.packages;
    } catch {
      continue; // no readable package.json here — keep walking up
    }
    if (specs?.length) {
      // Several specs can share one npx invocation; prefer the one that names us.
      return specs.find((spec) => spec.includes(fallback)) ?? (specs.length === 1 ? specs[0]! : fallback);
    }
  }
  return fallback;
}

const AGENTS: AgentSpec[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    location: "~/.claude.json (global) or .mcp.json (project)",
    format: "json",
    mergeKey: "mcpServers",
    writeTarget: join(homedir(), ".claude.json"),
    entry: (cmd, args) => ({ command: cmd, args }),
    snippet: (cmd, args) =>
      jsonSnippet({ mcpServers: { "agent-eyes": { command: cmd, args } } }) +
      `\nor:  claude mcp add agent-eyes -- ${cmd} ${args.join(" ")}`,
  },
  {
    id: "cursor",
    name: "Cursor",
    location: "~/.cursor/mcp.json (global) or .cursor/mcp.json (project)",
    format: "json",
    mergeKey: "mcpServers",
    writeTarget: join(homedir(), ".cursor", "mcp.json"),
    entry: (cmd, args) => ({ command: cmd, args }),
    snippet: (cmd, args) => jsonSnippet({ mcpServers: { "agent-eyes": { command: cmd, args } } }),
  },
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    location: "~/.codex/config.toml",
    format: "toml",
    entry: (cmd, args) => ({ command: cmd, args }),
    snippet: (cmd, args) =>
      `[mcp_servers.agent-eyes]\ncommand = ${JSON.stringify(cmd)}\nargs = ${tomlArray(args)}`,
  },
  {
    id: "zed",
    name: "Zed",
    location: "~/.config/zed/settings.json",
    format: "json",
    mergeKey: "context_servers",
    writeTarget: join(homedir(), ".config", "zed", "settings.json"),
    entry: (cmd, args) => ({ source: "custom", command: cmd, args, env: {} }),
    snippet: (cmd, args) =>
      jsonSnippet({ context_servers: { "agent-eyes": { source: "custom", command: cmd, args, env: {} } } }),
  },
  {
    id: "vscode",
    name: "VS Code (MCP / Copilot agent mode)",
    location: ".vscode/mcp.json (workspace)",
    format: "json",
    mergeKey: "servers",
    writeTarget: join(process.cwd(), ".vscode", "mcp.json"),
    entry: (cmd, args) => ({ command: cmd, args }),
    snippet: (cmd, args) => jsonSnippet({ servers: { "agent-eyes": { command: cmd, args } } }),
  },
];

/** Merge the server entry into an agent's JSON config (backs up first). */
function writeAgentConfig(agent: AgentSpec, cmd: string, args: string[]): void {
  if (agent.format !== "json" || !agent.mergeKey || !agent.writeTarget) {
    log("  (--write not supported for this format — add the snippet above manually)");
    log(indent(agent.snippet(cmd, args)));
    return;
  }
  const target = agent.writeTarget;
  try {
    let root: Record<string, unknown> = {};
    if (existsSync(target)) {
      try {
        root = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>;
      } catch {
        log(`  ! ${target} is not valid JSON — not touching it. Add the snippet manually:`);
        log(indent(agent.snippet(cmd, args)));
        return;
      }
      copyFileSync(target, `${target}.agent-eyes-bak`);
    } else {
      mkdirSync(dirname(target), { recursive: true });
    }
    const bucket = (root[agent.mergeKey] as Record<string, unknown>) ?? {};
    bucket["agent-eyes"] = agent.entry(cmd, args);
    root[agent.mergeKey] = bucket;
    writeFileSync(target, `${JSON.stringify(root, null, 2)}\n`);
    log(`  ✓ Wrote agent-eyes into ${target}${existsSync(`${target}.agent-eyes-bak`) ? " (backup: .agent-eyes-bak)" : ""}`);
  } catch (error) {
    log(`  ! Could not write ${target} (${String(error)}). Add the snippet manually:`);
    log(indent(agent.snippet(cmd, args)));
  }
}

function jsonSnippet(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

function tomlArray(values: string[]): string {
  return `[${values.map((v) => JSON.stringify(v)).join(", ")}]`;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}

function log(message: string): void {
  // setup runs INSTEAD of the stdio server, so stdout is free for humans.
  process.stdout.write(`${message}\n`);
}
