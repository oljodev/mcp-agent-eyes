/** Types for manage_tabs — multiple named real-browser tabs kept open at once. */

import type { PageHealth } from "./health.js";
import type { ViewportName } from "./viewports.js";

export const TAB_ACTIONS = ["open", "switch", "close", "list"] as const;
export type TabAction = (typeof TAB_ACTIONS)[number];

export interface TabSummary {
  label: string;
  url: string;
  viewport: ViewportName;
  active: boolean;
}

export interface ManageTabsInput {
  action: TabAction;
  label?: string | undefined;
  url?: string | undefined;
}

export interface ManageTabsResult {
  action: TabAction;
  activeLabel: string;
  tabs: TabSummary[];
  summary: string;
  health: PageHealth;
}
