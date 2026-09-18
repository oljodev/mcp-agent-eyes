/**
 * BrowserCore — the shared, stateful heart of the persistent session: one
 * Chromium instance, one user-facing context + page kept alive across tool
 * calls, the serialization queue, viewport/navigation bookkeeping, auth/session
 * config (replayed onto every freshly created context), health telemetry, and
 * the image encoder. Page-only logic lives in sibling free-function modules
 * (navigation, screenshot, interactions); BrowserCore owns the mutable state
 * they read and write.
 */

import type { Browser, BrowserContext, Page } from "playwright-core";

import {
  type BrowserConfig,
  type BrowserMode,
  type Visibility,
  readBrowserConfig,
  readSettings,
} from "../config.js";
import type { PageHealth } from "../types/health.js";
import type { MockRoute } from "../types/network.js";
import type { SessionCookie } from "../types/session.js";
import type { TabSummary } from "../types/tabs.js";
import { NAVIGATION_TIMEOUT_MS } from "../types/timeouts.js";
import { VIEWPORTS, type ViewportName } from "../types/viewports.js";
import {
  acquireBrowser,
  attachDefaultContext,
  ensureDisplayAvailable,
  launchEncoderBrowser,
} from "./acquire.js";
import { BrowserToolError } from "./errors.js";
import { Encoder } from "./encoder.js";
import { HealthMonitor } from "./health.js";
import { deviceScaleFactor } from "./image-utils.js";
import { ManagedChrome } from "./managed-chrome.js";
import { applyViewport, navigateIfNeeded } from "./navigation.js";

const DEFAULT_TAB = "main";

/** What a tab was showing, so a relaunched browser can restore it. */
interface TabSnapshot {
  label: string;
  /** A real page URL to re-open, or null for a blank/internal page. */
  url: string | null;
  viewport: ViewportName;
}

/** Per-tab state. Each named tab is a real browser page with its own bookkeeping. */
interface TabState {
  page: Page;
  /** Last URL successfully passed to goto() — survives server redirects. */
  lastNavigatedUrl: string | null;
  /** The active breakpoint, or null until applyViewport runs on this page. */
  currentViewport: ViewportName | null;
  crashed: boolean;
}

export class BrowserCore {
  private browser: Browser | null = null;
  private contextRef: BrowserContext | null = null;
  /** Named tabs, all kept open at once. The active one services activePage(). */
  private readonly tabs = new Map<string, TabState>();
  private activeLabel = DEFAULT_TAB;

  // Re-encodes screenshots via Chromium codecs on a hidden page. It reuses the
  // main browser ONLY when that's a launched headless one; for an attached real
  // Chrome (managed/cdp) or a visible headed window it launches its own private,
  // invisible browser, so re-encoding never pops a blank window the human sees.
  readonly encoder = new Encoder({
    reusable: () => (this.activeMode === "headless" ? this.browser : null),
    launchPrivate: () => launchEncoderBrowser(readBrowserConfig().chromePath),
  });
  private readonly health = new HealthMonitor();

  private closed = false;
  /** The mode the live browser is running in; null until first launch/attach. */
  private activeMode: BrowserMode | null = null;
  /** Window-raising policy for the live browser (set at acquire time). */
  private activeVisibility: Visibility = "on-demand";
  /** Whether the live managed Chrome was launched headless (no visible window). */
  private activeHeadless = false;
  /** Owns a real Chrome agent-eyes launches itself in "managed" mode. */
  private readonly managed = new ManagedChrome();
  /**
   * Set once a human handoff has promoted the invisible managed Chrome to a
   * visible one; it then stays visible for the rest of the session (relaunching
   * back into invisibility would throw away the state the human just fixed).
   */
  private forcedVisible = false;

  /**
   * The resolved browser config, with the handoff promotion folded in. Every
   * launch/teardown path reads THIS, never readBrowserConfig() directly, so the
   * promotion survives a crash-rebuild of the browser.
   */
  private resolveConfig(): BrowserConfig {
    const config = readBrowserConfig();
    return this.forcedVisible ? { ...config, headless: false } : config;
  }

  /** The active tab's state, if any tab is open. */
  private get activeTab(): TabState | undefined {
    return this.tabs.get(this.activeLabel);
  }

  // currentViewport / lastNavigatedUrl proxy the ACTIVE tab, so every op and
  // navigation.ts read/write them unchanged while each tab carries its own value.
  get currentViewport(): ViewportName | null {
    return this.activeTab?.currentViewport ?? null;
  }
  set currentViewport(value: ViewportName | null) {
    const tab = this.activeTab;
    if (tab) {
      tab.currentViewport = value;
    }
  }
  get lastNavigatedUrl(): string | null {
    return this.activeTab?.lastNavigatedUrl ?? null;
  }
  set lastNavigatedUrl(value: string | null) {
    const tab = this.activeTab;
    if (tab) {
      tab.lastNavigatedUrl = value;
    }
  }

  // --- session state ---------------------------------------------------------
  // The context is ephemeral (rebuilt on a crash), so auth/session config lives
  // here as the source of truth and is REPLAYED onto every freshly created
  // context by applySessionState() — so "log in once" survives a crash.
  seededCookies: SessionCookie[] = [];
  extraHeaders: Record<string, string> = {};
  initScripts: string[] = [];
  /** storageState file to seed the NEXT context with (set by manage_session load). */
  storageStatePath: string | null = null;
  /** Stubbed network routes (mock_route), re-registered on every context. */
  mockRoutes: MockRoute[] = [];

  // Serializes all public operations: MCP clients may issue tool calls
  // concurrently, but interleaving a navigation with a capture is nonsense.
  private queue: Promise<unknown> = Promise.resolve();

  get context(): BrowserContext | null {
    return this.contextRef;
  }

  get page(): Page | null {
    const tab = this.activeTab;
    return tab && !tab.page.isClosed() ? tab.page : null;
  }

  get pageCrashed(): boolean {
    return this.activeTab?.crashed ?? false;
  }

  activeLabelName(): string {
    return this.activeLabel;
  }

  /** The mode the live browser is running in (falls back to the resolved config). */
  currentMode(): BrowserMode {
    return this.activeMode ?? this.resolveConfig().mode;
  }

  /**
   * Whether a real, VISIBLE browser is available for a human to act in (headed,
   * attached CDP, or managed) — the gate for await_human_interaction. Pure
   * headless, and managed launched with browser.headless (no window), are not
   * eligible: there'd be nothing for the human to see.
   */
  isHeaded(): boolean {
    const mode = this.currentMode();
    if (mode === "headless") {
      return false;
    }
    if (mode === "managed") {
      const headless =
        this.activeMode === "managed" ? this.activeHeadless : this.resolveConfig().headless;
      return !headless;
    }
    return mode === "headed" || mode === "cdp";
  }

  /**
   * Whether we connected to a real browser over CDP (attached or managed) rather
   * than launching our own Playwright Chromium. These share an existing default
   * context and must never have that context torn down on teardown.
   */
  isAttached(): boolean {
    return attachedMode(this.currentMode());
  }

  /** The URL currently loaded in the active tab, if any. */
  currentUrl(): string | null {
    const tab = this.activeTab;
    return tab && !tab.page.isClosed() ? tab.page.url() : null;
  }

  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const wrapped = async (): Promise<T> => {
      this.assertOpen();
      return fn();
    };
    const run = this.queue.then(wrapped, wrapped);
    // Keep the chain alive even when fn rejects; the caller still sees the
    // rejection through `run`.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new BrowserToolError("The agent-eyes server is shutting down.");
    }
  }

  /** Snapshot-and-clear health buffers (+ blank-page check) for this slot. */
  drainHealth(): Promise<PageHealth> {
    const tab = this.activeTab;
    return this.health.drain(tab?.page ?? null, tab?.crashed ?? false);
  }

  activePage(): Page {
    const tab = this.activeTab;
    if (!tab || tab.page.isClosed() || tab.crashed || !this.browser?.isConnected()) {
      throw new BrowserToolError(
        "No active browser session. Call capture_page_screenshot with a URL " +
          "first to open a page, then interact with it.",
      );
    }
    return tab.page;
  }

  /** Tear down the browser. Safe to call multiple times. */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    // Give an in-flight capture a bounded window to finish instead of yanking
    // the browser out from under it; queued-but-unstarted calls fail fast via
    // assertOpen(). File writes are write-then-rename, so a mid-save shutdown
    // never corrupts manifests or images.
    await Promise.race([this.queue, sleep(3_000)]).catch(() => undefined);
    await this.disposeBrowser();
  }

  private async disposeBrowser(): Promise<void> {
    const browser = this.browser;
    const mode = this.activeMode;
    const ownedTabs = [...this.tabs.values()];
    this.browser = null;
    this.contextRef = null;
    this.tabs.clear();
    this.activeLabel = DEFAULT_TAB;
    // Drops the encoder's context/page AND closes its private browser if it
    // launched one (attached/headed modes).
    await this.encoder.dispose();
    this.activeMode = null;
    if (attachedMode(mode)) {
      // We CONNECTED to a real Chrome — never close its context or the user's
      // tabs. Close ONLY the tabs WE opened, then disconnect. browser.close()
      // on a connected browser just drops the connection.
      for (const tab of ownedTabs) {
        if (!tab.page.isClosed()) {
          await tab.page.close().catch(() => undefined);
        }
      }
      if (browser) {
        await browser.close().catch(() => undefined);
      }
      if (mode === "managed") {
        // Default keepalive leaves our Chrome running for an instant warm
        // reconnect next session; keepalive=false fully closes it.
        await this.managed.shutdown(this.resolveConfig()).catch(() => undefined);
      }
      return;
    }
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }

  /**
   * Replay stored session config (headers, cookies, localStorage seeds) onto a
   * freshly created context, so a crash-rebuilt context carries the same auth.
   * setExtraHTTPHeaders REPLACES, so extraHeaders is always the full merged map.
   */
  async applySessionState(context: BrowserContext): Promise<void> {
    if (Object.keys(this.extraHeaders).length > 0) {
      await context.setExtraHTTPHeaders(this.extraHeaders);
    }
    if (this.seededCookies.length > 0) {
      await context.addCookies(this.seededCookies);
    }
    for (const content of this.initScripts) {
      await context.addInitScript({ content });
    }
    for (const route of this.mockRoutes) {
      await this.registerMock(context, route);
    }
  }

  /** Register one stubbed route on a context (route.fulfill with the stub). */
  async registerMock(context: BrowserContext, route: MockRoute): Promise<void> {
    await context.route(route.pattern, (r) =>
      r.fulfill({
        status: route.status,
        contentType: route.contentType,
        body: route.body,
        headers: route.headers,
      }),
    );
  }

  /**
   * Tear down ONLY the user-facing context + page (keeping the browser + encoder
   * warm), so the next ensurePage rebuilds the context — picking up a new
   * storageStatePath, or dropping cleared cookies/headers that can't be removed
   * from a live context. Clears the nav/viewport bookkeeping so the next
   * navigateIfNeeded actually re-navigates.
   */
  async recreateContext(): Promise<void> {
    const ownedTabs = [...this.tabs.values()];
    this.tabs.clear();
    this.activeLabel = DEFAULT_TAB;
    if (attachedMode(this.activeMode)) {
      // The context is the user's REAL profile — never tear it down. Drop only
      // our tabs; the next ensurePage opens a fresh background tab in the same
      // shared context. (storageState can't be re-seeded into a live real
      // context, so a manage_session "load" is a no-op here — logins already
      // persist in the user's profile.)
      for (const tab of ownedTabs) {
        if (!tab.page.isClosed()) {
          await tab.page.close().catch(() => undefined);
        }
      }
      return;
    }
    const context = this.contextRef;
    this.contextRef = null;
    if (context) {
      await context.close().catch(() => undefined); // closes its pages too
    }
  }

  async ensurePage(viewport: ViewportName): Promise<Page> {
    this.assertOpen();
    await this.ensureBrowserAndContext(viewport);

    let tab = this.activeTab;
    if (tab && (tab.page.isClosed() || tab.crashed)) {
      // A crashed renderer keeps isClosed() === false but every operation on it
      // throws — treat it exactly like a closed page and rebuild it.
      await tab.page.close().catch(() => undefined);
      this.tabs.delete(this.activeLabel);
      tab = undefined;
    }
    if (!tab) {
      tab = await this.makeTab();
      this.tabs.set(this.activeLabel, tab);
    }

    await applyViewport(this, tab.page, viewport);
    await this.applyVisibility(tab.page);
    return tab.page;
  }

  /** Ensure the browser + shared context exist (no tab work). */
  private async ensureBrowserAndContext(viewport: ViewportName): Promise<void> {
    if (this.browser && !this.browser.isConnected()) {
      // Chromium crashed or was killed externally; start fresh.
      await this.disposeBrowser();
    }

    if (!this.browser) {
      const config = this.resolveConfig();
      this.browser = await acquireBrowser(config, this.managed);
      // Reached only on success; acquireBrowser throws on failure (activeMode stays null).
      this.activeMode = config.mode;
      this.activeVisibility = config.visibility;
      this.activeHeadless = config.headless;
    }

    if (!this.contextRef) {
      // Attached (cdp/managed): reuse the real browser's EXISTING default context
      // (its profile + clean fingerprint). Launch: a fresh ephemeral context.
      this.contextRef = attachedMode(this.activeMode)
        ? attachDefaultContext(this.browser)
        : await this.browser.newContext({
            viewport: VIEWPORTS[viewport],
            deviceScaleFactor: deviceScaleFactor(),
            // Local dev servers frequently use self-signed certificates.
            ignoreHTTPSErrors: true,
            // storageState can ONLY be applied at creation time — a manage_session
            // "load" sets storageStatePath then recreates the context to land here.
            ...(this.storageStatePath ? { storageState: this.storageStatePath } : {}),
          });
      // Replay cookies / headers / localStorage seeds onto the context
      // (no-ops unless the agent explicitly configured them).
      await this.applySessionState(this.contextRef);
    }
  }

  /** Open a fresh page in the shared context and wrap it as a TabState. */
  private async makeTab(): Promise<TabState> {
    const context = this.contextRef;
    if (!context) {
      throw new BrowserToolError("internal: makeTab called before a context exists");
    }
    // A DEDICATED tab agent-eyes drives. In attached modes it's a background tab
    // in the user's window — never navigated, never raised during normal work
    // (only await_human_interaction or visibility:"always" surfaces it).
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    page.on("crash", () => {
      for (const state of this.tabs.values()) {
        if (state.page === page) {
          state.crashed = true;
          console.error(
            "agent-eyes: renderer crashed; the tab will be rebuilt on the next tool call",
          );
        }
      }
    });
    this.health.attach(page);
    return { page, lastNavigatedUrl: null, currentViewport: null, crashed: false };
  }

  /** visibility:"always" keeps the window foregrounded; on-demand never raises it. */
  private async applyVisibility(page: Page): Promise<void> {
    if (this.activeVisibility === "always") {
      await page.bringToFront().catch(() => undefined);
    }
  }

  // --- on-demand visibility (human handoff) ---------------------------------

  /**
   * Make a VISIBLE browser available for a human handoff, relaunching the
   * invisible managed Chrome with a window when that's what it takes.
   *
   * Managed Chrome runs with no window by default, so routine agent work never
   * interrupts the human. Playwright cannot switch a running browser to headed,
   * so the promotion is a relaunch: snapshot what each tab was showing, drop the
   * connection, respawn the SAME persistent profile with a window (logins and
   * cookies live in the profile, so they survive), then reopen the tabs on their
   * URLs. In-page state that was never persisted (typed-but-unsubmitted input,
   * JS state) does not survive — a challenge page simply re-renders.
   *
   * No-ops when a window is already there. For non-managed modes there is
   * nothing to promote; the caller reports that as an error.
   */
  async ensureVisibleBrowser(): Promise<void> {
    if (this.isHeaded() || this.currentMode() !== "managed") {
      return;
    }
    // Fail with the clear "no display" message BEFORE tearing anything down.
    ensureDisplayAvailable();
    const snapshot = this.snapshotTabs();
    this.forcedVisible = true;
    await this.disposeBrowser();
    await this.restoreTabs(snapshot);
  }

  /** What every open tab is showing, for restoring after a relaunch. */
  private snapshotTabs(): { active: string; tabs: TabSnapshot[] } {
    const tabs = [...this.tabs.entries()].map(([label, tab]) => ({
      label,
      url: tab.page.isClosed() ? null : restorableUrl(tab.page.url()),
      viewport: tab.currentViewport ?? ("desktop" as ViewportName),
    }));
    return { active: this.activeLabel, tabs };
  }

  /** Reopen the snapshotted tabs on the freshly launched browser. */
  private async restoreTabs(snapshot: { active: string; tabs: TabSnapshot[] }): Promise<void> {
    for (const tab of snapshot.tabs) {
      this.activeLabel = tab.label;
      const page = await this.ensurePage(tab.viewport);
      if (tab.url) {
        await navigateIfNeeded(this, page, tab.url, {});
      }
    }
    this.activeLabel = this.tabs.has(snapshot.active) ? snapshot.active : this.activeLabel;
  }

  // --- named multi-tab management (manage_tabs) -----------------------------

  /** Open a new named tab, make it active, and optionally navigate it. */
  async openTab(label: string, url: string | undefined, viewport: ViewportName): Promise<void> {
    assertValidLabel(label);
    if (this.tabs.has(label)) {
      throw new BrowserToolError(
        `A tab named "${label}" is already open. Use action=switch, or pick a new label.`,
      );
    }
    await this.ensureBrowserAndContext(viewport);
    const max = readSettings().tabs.maxOpen;
    if (this.tabs.size >= max) {
      throw new BrowserToolError(
        `Tab limit reached (${max} open). Close one with manage_tabs action=close, ` +
          "or raise tabs.maxOpen in .agent-eyes/settings.json.",
      );
    }
    const tab = await this.makeTab();
    this.tabs.set(label, tab);
    this.activeLabel = label;
    await applyViewport(this, tab.page, viewport);
    if (url) {
      await navigateIfNeeded(this, tab.page, url, {});
    }
    await this.applyVisibility(tab.page);
  }

  /** Make an existing tab active. A dead tab is rebuilt on the next ensurePage. */
  switchTab(label: string): void {
    if (!this.tabs.has(label)) {
      throw new BrowserToolError(
        `No tab named "${label}". Open it with manage_tabs action=open, or check action=list.`,
      );
    }
    this.activeLabel = label;
  }

  /** Close a named tab (never the last one); reactivate another if it was active. */
  async closeTab(label: string): Promise<void> {
    const tab = this.tabs.get(label);
    if (!tab) {
      throw new BrowserToolError(
        `No tab named "${label}" to close. Check action=list for the open tabs.`,
      );
    }
    if (this.tabs.size <= 1) {
      throw new BrowserToolError(
        "Cannot close the last remaining tab — at least one must stay open.",
      );
    }
    this.tabs.delete(label);
    if (!tab.page.isClosed()) {
      await tab.page.close().catch(() => undefined);
    }
    if (this.activeLabel === label) {
      this.activeLabel = this.tabs.keys().next().value ?? DEFAULT_TAB;
    }
  }

  /** Snapshot of every open tab for manage_tabs action=list. */
  tabSummaries(): TabSummary[] {
    return [...this.tabs.entries()].map(([label, tab]) => ({
      label,
      url: tab.page.isClosed() ? "(closed)" : tab.page.url(),
      viewport: tab.currentViewport ?? "desktop",
      active: label === this.activeLabel,
    }));
  }
}

/** A page URL worth re-opening after a relaunch (blank/internal pages aren't). */
function restorableUrl(url: string): string | null {
  return url && /^https?:/i.test(url) ? url : null;
}

/** Modes where we connected to a real browser over CDP (vs. launched our own). */
function attachedMode(mode: BrowserMode | null): boolean {
  return mode === "cdp" || mode === "managed";
}

/** A tab label must be a non-empty, reasonable identifier. */
function assertValidLabel(label: string): void {
  if (!label || !label.trim()) {
    throw new BrowserToolError("A tab label must be a non-empty name.");
  }
  if (label.length > 64) {
    throw new BrowserToolError("A tab label must be 64 characters or fewer.");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
