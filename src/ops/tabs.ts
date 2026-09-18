/**
 * manage_tabs — keep several real browser tabs open at once and switch between
 * them by a label the agent assigns. Concurrency is unchanged (runExclusive
 * still serializes every tool call); multi-tab only means the OTHER tab's state
 * survives while you work in the active one. All existing tools operate on the
 * active tab via activePage()/ensurePage().
 */

import { BrowserToolError } from "../browser/errors.js";
import type { BrowserSession } from "../browser/session.js";
import type { ManageTabsInput, ManageTabsResult, TabAction } from "../types/tabs.js";

export function manageTabs(
  session: BrowserSession,
  input: ManageTabsInput,
): Promise<ManageTabsResult> {
  return session.core.runExclusive(async () => {
    const core = session.core;
    const viewport = core.currentViewport ?? "desktop";

    switch (input.action) {
      case "open": {
        await core.openTab(requireLabel(input, "open"), input.url, viewport);
        break;
      }
      case "switch": {
        core.switchTab(requireLabel(input, "switch"));
        break;
      }
      case "close": {
        await core.closeTab(requireLabel(input, "close"));
        break;
      }
      case "list":
        break;
    }

    const tabs = core.tabSummaries();
    return {
      action: input.action,
      activeLabel: core.activeLabelName(),
      tabs,
      summary: summarize(input.action, core.activeLabelName(), tabs),
      health: await core.drainHealth(),
    };
  });
}

function requireLabel(input: ManageTabsInput, action: TabAction): string {
  if (!input.label || !input.label.trim()) {
    throw new BrowserToolError(`manage_tabs action=${action} requires a "label".`);
  }
  return input.label;
}

function summarize(action: TabAction, activeLabel: string, tabs: ManageTabsResult["tabs"]): string {
  const head =
    action === "open"
      ? `Opened tab "${activeLabel}" (now active)`
      : action === "switch"
        ? `Switched to tab "${activeLabel}"`
        : action === "close"
          ? `Closed a tab; active is now "${activeLabel}"`
          : `${tabs.length} tab(s) open`;
  const list = tabs
    .map((t) => `  ${t.active ? "▶" : " "} ${t.label} — ${t.url} @ ${t.viewport}`)
    .join("\n");
  return `${head}.\n${list}`;
}
