/**
 * Browser acquisition — turning the resolved config into a live Browser. Kept
 * out of core.ts (which owns the stateful session) so each stays focused: this
 * module is the pure "how do we get a Browser for this mode" logic.
 *
 *   managed  → ManagedChrome raw-spawns a real Chrome (clean fingerprint), attach
 *   cdp      → attach to a Chrome the user launched (--remote-debugging-port)
 *   headed   → Playwright launches a visible Chromium
 *   headless → Playwright launches a headless Chromium (default for CI/speed)
 */

import { chromium, type Browser, type BrowserContext } from "playwright-core";

import type { BrowserConfig } from "../config.js";
import { CDP_CONNECT_TIMEOUT_MS } from "../types/timeouts.js";
import {
  BrowserToolError,
  formatCdpError,
  formatLaunchError,
  messageOf,
} from "./errors.js";
import { findChromeBinary } from "./find-chrome.js";
import type { ManagedChrome } from "./managed-chrome.js";

/** Obtain a browser per the resolved mode. Throws loudly on any failure. */
export function acquireBrowser(
  config: BrowserConfig,
  managed: ManagedChrome,
): Promise<Browser> {
  switch (config.mode) {
    case "managed":
      return connectManaged(config, managed);
    case "cdp":
      return connectBrowser(config.cdpUrl ?? "");
    default:
      return launchBrowser(config.mode === "headed");
  }
}

/**
 * Managed mode: have ManagedChrome launch (or reuse) a real Chrome with a clean
 * fingerprint, then attach over CDP. No manual commands; no silent fallback —
 * every failure surfaces a clear, actionable error.
 */
async function connectManaged(
  config: BrowserConfig,
  managed: ManagedChrome,
): Promise<Browser> {
  const endpoint = await managed.ensure(config);
  try {
    return await chromium.connectOverCDP(endpoint, { timeout: CDP_CONNECT_TIMEOUT_MS });
  } catch (error) {
    throw new BrowserToolError(
      `Couldn't attach to the managed Chrome at ${endpoint}: ${messageOf(error)}. ` +
        "It started but the DevTools connection failed — retry, or set " +
        "browser.mode to \"headless\" to use the built-in browser.",
    );
  }
}

function launchBrowser(headed: boolean): Promise<Browser> {
  // AGENT_EYES_HEADED / mode "headed" opens a visible window so a human can
  // interact with the page directly (see await_human_interaction).
  if (headed) {
    ensureDisplayAvailable();
  }
  const baseArgs = ["--disable-dev-shm-usage", "--hide-scrollbars"];
  return chromium
    .launch({ headless: !headed, args: baseArgs })
    .catch(async (firstError: unknown) => {
      // On hardened Linux kernels (unprivileged user namespaces disabled)
      // Chromium's sandbox cannot start. Retry once without it; the tool only
      // visits pages the agent was asked to inspect, an acceptable degradation.
      try {
        return await chromium.launch({
          headless: !headed,
          args: [...baseArgs, "--no-sandbox", "--disable-setuid-sandbox"],
        });
      } catch {
        throw new BrowserToolError(formatLaunchError(firstError));
      }
    });
}

/**
 * Attach to a Chrome the USER launched (with --remote-debugging-port). Because
 * that Chrome was started normally — not by Playwright — it carries no
 * automation fingerprint (navigator.webdriver === false), so bot-detection
 * treats it as a real browser and the human's own click actually validates.
 */
async function connectBrowser(cdpUrl: string): Promise<Browser> {
  if (!cdpUrl) {
    throw new BrowserToolError(
      "CDP mode is selected but no endpoint is set — provide browser.cdpUrl " +
        "(e.g. http://localhost:9222).",
    );
  }
  try {
    return await chromium.connectOverCDP(cdpUrl, { timeout: CDP_CONNECT_TIMEOUT_MS });
  } catch (error) {
    throw new BrowserToolError(formatCdpError(error, cdpUrl));
  }
}

/**
 * A PRIVATE, always-headless browser used ONLY to re-encode screenshots (canvas
 * codecs on about:blank). Kept entirely separate from the user-facing browser so
 * an attached real Chrome (managed/cdp) or a visible headed window never sprouts
 * a blank encoder window/tab in the human's face. Reuses the real Chrome binary
 * when we can find one (managed users may not have Playwright's bundled
 * chromium); its fingerprint is irrelevant — it never visits a real site. Uses
 * its own throwaway profile, so it can't clash with the managed profile lock.
 */
export async function launchEncoderBrowser(chromePath: string | null): Promise<Browser> {
  let executablePath: string | undefined;
  try {
    executablePath = findChromeBinary(chromePath);
  } catch {
    executablePath = undefined; // fall back to Playwright's bundled chromium
  }
  const args = ["--disable-dev-shm-usage", "--hide-scrollbars"];
  try {
    return await chromium.launch({ headless: true, executablePath, args });
  } catch {
    // Sandbox-restricted host (container / hardened kernel): retry without it.
    return await chromium.launch({
      headless: true,
      executablePath,
      args: [...args, "--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
}

/** The user's existing default context in an attached Chrome (their real profile). */
export function attachDefaultContext(browser: Browser): BrowserContext {
  const context = browser.contexts()[0];
  if (!context) {
    throw new BrowserToolError(
      "Attached to Chrome over CDP, but it has no open window/context. Open a " +
        "tab in that Chrome instance and retry.",
    );
  }
  return context;
}

/**
 * Headed Chromium needs a graphical display. On Linux without one (no $DISPLAY
 * and no Wayland socket), the launch fails cryptically — surface a clear,
 * actionable error instead. We deliberately do NOT fall back to a virtual
 * framebuffer (xvfb): an invisible window defeats the whole point of headed mode.
 * Also called before a human handoff promotes the invisible managed Chrome to a
 * visible one, so that promotion fails with the same clear message.
 */
export function ensureDisplayAvailable(): void {
  if (process.platform !== "linux") {
    return; // macOS / Windows always have a display.
  }
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    return;
  }
  throw new BrowserToolError(
    "Headed (visible) browser mode was requested, but no display was found — " +
      "neither $DISPLAY (X11) nor $WAYLAND_DISPLAY is set. Use browser.mode " +
      '"headless", or start agent-eyes on a machine with a graphical display.',
  );
}
