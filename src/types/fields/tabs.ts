/** zod field schemas for manage_tabs. */

import { z } from "zod";

import { TAB_ACTIONS } from "../tabs.js";

export const tabActionField = z
  .enum(TAB_ACTIONS)
  .describe(
    '"open" opens a named tab and makes it active, "switch" activates an ' +
      'existing one, "close" closes one (never the last), "list" returns ' +
      "every tab with its label, url, viewport, and active flag.",
  );

export const tabLabelField = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe(
    'Short name you assign, e.g. "staging". Required for open/switch/close; ' +
      'unique when opening. The default tab is "main".',
  );

export const tabUrlField = z
  .string()
  .url()
  .optional()
  .describe("open only: navigate the new tab to this URL after opening it.");
