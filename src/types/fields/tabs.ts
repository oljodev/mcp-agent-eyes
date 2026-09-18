/** zod field schemas for manage_tabs. */

import { z } from "zod";

import { TAB_ACTIONS } from "../tabs.js";

export const tabActionField = z
  .enum(TAB_ACTIONS)
  .describe(
    'What to do. "open" opens a new named tab (and optionally navigates it), ' +
      'making it active. "switch" makes an existing tab active. "close" closes ' +
      'a named tab (not the last one). "list" returns every open tab with its ' +
      "label, url, viewport, and which is active.",
  );

export const tabLabelField = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe(
    "The tab's label — a short name you assign (e.g. \"lovable\", \"test\"). " +
      "Required for open/switch/close; must be unique when opening, and must " +
      "already exist for switch/close. The default tab is \"main\".",
  );

export const tabUrlField = z
  .string()
  .url()
  .optional()
  .describe("open only: navigate the new tab to this URL after opening it.");
