/**
 * ManagedChrome — agent-eyes launches and owns a REAL Chrome/Chromium itself,
 * with a clean (non-automated) fingerprint, so the user runs no commands.
 *
 * The trick: spawn the Chrome BINARY directly (via child_process), NOT through
 * Playwright's chromium.launch(), which injects --enable-automation and makes
 * navigator.webdriver === true (Cloudflare Turnstile et al. detect and reject
 * that). We pass only a debug port, a persistent profile dir, and benign flags,
 * wait for its DevTools endpoint, and hand the http URL back to core.ts to
 * connectOverCDP. The persistent profile means the human logs in once and stays
 * logged in across restarts; a running instance is reused instead of re-spawned.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";

import type { BrowserConfig } from "../config.js";
import { BrowserToolError, messageOf } from "./errors.js";
import { findChromeBinary } from "./find-chrome.js";

/** How long to wait for the spawned Chrome to expose its DevTools endpoint. */
const READY_TIMEOUT_MS = 20_000;
const POLL_MS = 150;
/** Our reconnect lockfile (port + pid) inside the profile dir. */
const LOCK_FILE = "agent-eyes-cdp.json";

interface Lock {
  port: number;
  pid: number;
  /** Whether the running instance was launched headless (no visible window). */
  headless: boolean;
}

export class ManagedChrome {
  /**
   * Ensure a managed Chrome is up and return its CDP http endpoint. Reuses a
   * still-running managed instance (warm logins, instant reconnect); only spawns
   * a fresh one when none is alive. Throws a clear, actionable error if Chrome
   * can't be found or doesn't become ready — never silently falls back.
   */
  async ensure(config: BrowserConfig): Promise<string> {
    const wantHeadless = config.headless === true;
    const lock = readLock(config.profileDir);
    if (lock && (await probeVersion(lock.port))) {
      // Reuse the warm instance only if its visibility matches what's wanted.
      // Otherwise (e.g. a keepalive'd VISIBLE Chrome but headless was just
      // turned on) kill it and relaunch — else the setting would silently
      // appear to do nothing until the user closed Chrome by hand.
      if (lock.headless === wantHeadless) {
        return endpoint(lock.port);
      }
      if (lock.pid > 0) {
        try {
          process.kill(lock.pid);
        } catch {
          // Already gone — fall through to a fresh spawn.
        }
      }
      await waitForPortDead(lock.port);
    }
    return this.spawn(config);
  }

  /**
   * Teardown: by default LEAVE the managed Chrome running (keepalive) so the
   * next session reconnects instantly with warm logins. Only when keepalive is
   * off do we fully close the Chrome WE manage (by its recorded pid) — never any
   * other browser.
   */
  async shutdown(config: BrowserConfig): Promise<void> {
    if (config.keepalive) {
      return;
    }
    const lock = readLock(config.profileDir);
    if (lock && lock.pid > 0) {
      try {
        process.kill(lock.pid);
      } catch {
        // Already gone — nothing to do.
      }
    }
    rmSync(join(config.profileDir, LOCK_FILE), { force: true });
  }

  private async spawn(config: BrowserConfig): Promise<string> {
    const bin = findChromeBinary(config.chromePath);
    mkdirSync(config.profileDir, { recursive: true });

    const baseArgs = [
      // Port 0 → Chrome picks a free port and writes it to DevToolsActivePort.
      "--remote-debugging-port=0",
      `--user-data-dir=${config.profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      // NOT an automation switch — the opposite: it REMOVES the
      // navigator.webdriver marker, so even Chromium builds that default it on
      // look like a normal human browser. Harmless for real Google Chrome.
      "--disable-blink-features=AutomationControlled",
    ];

    // Invisible managed mode: a REAL Chrome with the same persistent (logged-in)
    // profile and clean fingerprint, just with no window the human has to see.
    // (--headless=new is the modern headless that renders like headed Chrome.)
    if (config.headless === true) {
      baseArgs.push("--headless=new");
    }

    // First attempt keeps Chrome's sandbox (best for a real browser holding real
    // logins). On containers / flatpak / hardened kernels the sandbox can't
    // start and Chrome aborts immediately — retry once with --no-sandbox, the
    // same degradation the built-in launcher accepts. A normal desktop never
    // reaches the retry, so it keeps its sandbox.
    const userFlags = config.extraFlags;
    try {
      return await this.launchOnce(bin, [...baseArgs, ...userFlags], config);
    } catch (firstError) {
      if (userFlags.includes("--no-sandbox")) {
        throw firstError;
      }
      try {
        return await this.launchOnce(
          bin,
          [...baseArgs, "--no-sandbox", ...userFlags],
          config,
        );
      } catch {
        throw firstError; // surface the original (sandboxed) failure
      }
    }
  }

  /** One spawn-and-wait attempt; throws a clear BrowserToolError on any failure. */
  private async launchOnce(
    bin: string,
    args: string[],
    config: BrowserConfig,
  ): Promise<string> {
    const profileDir = config.profileDir;
    const portFile = join(profileDir, "DevToolsActivePort");
    rmSync(portFile, { force: true }); // drop a stale port from a previous run

    let child: ChildProcess;
    try {
      // detached + unref so the Chrome we start outlives our own process — that
      // is what keepalive (reconnect-warm-next-time) depends on.
      child = spawn(bin, [...args, "about:blank"], { detached: true, stdio: "ignore" });
    } catch (error) {
      throw new BrowserToolError(
        `Couldn't start managed Chrome (${bin}): ${messageOf(error)}. Set ` +
          "AGENT_EYES_CHROME_PATH to a valid Chrome, or AGENT_EYES_BROWSER=headless.",
      );
    }
    let earlyExit: string | null = null;
    child.on("error", (error) => {
      earlyExit ??= messageOf(error);
    });
    child.on("exit", (code, signal) => {
      earlyExit ??= `Chrome exited early (code ${code ?? "?"}, signal ${signal ?? "none"})`;
    });
    child.unref();

    const port = await waitForDevToolsPort(portFile, () => earlyExit).catch((error: unknown) => {
      throw new BrowserToolError(
        `Couldn't start/attach managed Chrome: ${messageOf(error)}. Binary: ${bin}. ` +
          "Check that it launches normally, or set AGENT_EYES_CHROME_PATH / " +
          "AGENT_EYES_BROWSER=headless.",
      );
    });
    if (!(await probeVersion(port))) {
      throw new BrowserToolError(
        `Managed Chrome opened DevTools on port ${port} but /json/version did not ` +
          "respond. Try again, or set AGENT_EYES_BROWSER=headless.",
      );
    }

    writeLock(profileDir, { port, pid: child.pid ?? -1, headless: config.headless === true });
    return endpoint(port);
  }
}

const endpoint = (port: number): string => `http://127.0.0.1:${port}`;

function readLock(profileDir: string): Lock | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(profileDir, LOCK_FILE), "utf8"));
    if (
      parsed &&
      typeof (parsed as Lock).port === "number" &&
      typeof (parsed as Lock).pid === "number"
    ) {
      const lock = parsed as Lock;
      // Back-compat: a lock written before the headless flag existed → visible.
      return { port: lock.port, pid: lock.pid, headless: lock.headless === true };
    }
    return null;
  } catch {
    return null;
  }
}

function writeLock(profileDir: string, lock: Lock): void {
  try {
    writeFileSync(join(profileDir, LOCK_FILE), JSON.stringify(lock));
  } catch {
    // Best effort — reuse just won't kick in next time if this fails.
  }
}

/** Poll for Chrome's DevToolsActivePort file (its first line is the chosen port). */
async function waitForDevToolsPort(
  portFile: string,
  earlyExit: () => string | null,
): Promise<number> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const exited = earlyExit();
    if (exited) {
      throw new Error(exited);
    }
    try {
      const first = readFileSync(portFile, "utf8").split("\n")[0]?.trim();
      const port = Number(first);
      if (first && Number.isInteger(port) && port > 0) {
        return port;
      }
    } catch {
      // Not written yet.
    }
    if (Date.now() >= deadline) {
      throw new Error("timed out waiting for the DevTools port");
    }
    await sleep(POLL_MS);
  }
}

/** Wait (bounded) for a just-killed Chrome's DevTools port to stop responding. */
async function waitForPortDead(port: number): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (!(await probeVersion(port))) {
      return;
    }
    await sleep(POLL_MS);
  }
}

/** Is a Chrome DevTools endpoint live on this port? (GET /json/version → 200). */
function probeVersion(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: "/json/version", timeout: 1_000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

