/**
 * Viewport + navigation control. Free functions that operate on a page and
 * mutate the BrowserCore's viewport/nav bookkeeping through its public fields,
 * so the lifecycle logic in core.ts stays compact. (BrowserCore is imported as
 * a TYPE only, so there is no runtime import cycle.)
 */

import { errors as playwrightErrors, type Page } from "playwright-core";

import {
  NAVIGATION_TIMEOUT_MS,
  REFLOW_PAUSE_MS,
  SCROLL_RESET_SETTLE_MS,
  SETTLE_TIMEOUT_MS,
} from "../types/timeouts.js";
import { VIEWPORTS, type ViewportName } from "../types/viewports.js";
import type { BrowserCore } from "./core.js";
import {
  BrowserToolError,
  formatNavigationError,
  normalizeUrl,
} from "./errors.js";
import { preflight } from "./preflight.js";

export async function applyViewport(
  core: BrowserCore,
  page: Page,
  viewport: ViewportName,
): Promise<void> {
  if (core.currentViewport === viewport) {
    return;
  }
  try {
    await page.setViewportSize(VIEWPORTS[viewport]);
  } catch (error) {
    // A real Chrome we attached to (cdp/managed) owns its own window size;
    // viewport emulation can be rejected. Don't break background work over it —
    // keep the real window's size and record the intent so we don't retry endlessly.
    if (!core.isAttached()) {
      throw error;
    }
  }
  core.currentViewport = viewport;
  // Give responsive layouts a beat to reflow before we measure or shoot.
  await page.waitForTimeout(REFLOW_PAUSE_MS);
}

export async function navigateIfNeeded(
  core: BrowserCore,
  page: Page,
  rawUrl: string,
  opts: { forceReload?: boolean } = {},
): Promise<void> {
  const url = normalizeUrl(rawUrl);

  // Skip navigation when the requested URL is what's on screen — or what
  // we last navigated to. The second check matters for redirects: after
  // requesting / and landing on /login, re-requesting / must NOT reload
  // and destroy the state the agent built up on /login.
  //
  // forceReload bypasses the skip: a goto() to the same URL re-fetches
  // everything, which is what a fix→verify loop needs after editing code
  // (HMR can otherwise leave the open page on a stale or crashed render).
  if (!opts.forceReload && (page.url() === url || core.lastNavigatedUrl === url)) {
    return;
  }

  // Probe reachability from Node first: a navigation to a dead server
  // replaces the live page with a Chromium error page, destroying session
  // state. With the probe, a typo'd port or stopped dev server is
  // reported while the agent's page state survives untouched.
  await preflight(url);

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    core.lastNavigatedUrl = url;
  } catch (error) {
    core.lastNavigatedUrl = null;
    const timedOut = error instanceof playwrightErrors.TimeoutError;
    // Non-timeout failures leave Chromium racing to commit an error page
    // (page.url() is unreliable for a while); a timed-out navigation that
    // DID commit leaves a half-loaded page that the URL check would
    // otherwise report as success forever. Pin both to a known URL so the
    // next call deterministically re-navigates.
    if (!timedOut || page.url() === url) {
      await page
        .goto("about:blank", { timeout: 5_000 })
        .catch(() => undefined);
    }
    throw new BrowserToolError(formatNavigationError(error, url));
  }

  await settle(page);
}

export async function settle(page: Page): Promise<void> {
  // Best effort: pages with polling/websockets never reach networkidle,
  // and a screenshot of a 99%-loaded page beats a hard error.
  await page
    .waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS })
    .catch(() => undefined);
}

/**
 * Pin the page's scroll position to the top-left origin and let
 * scroll-linked effects settle. Best effort — a busy page shouldn't fail
 * the surrounding capture.
 */
export async function resetScroll(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(SCROLL_RESET_SETTLE_MS);
  } catch {
    // Page mid-navigation or busy — capture from wherever it is.
  }
}
