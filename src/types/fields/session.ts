/** zod field schemas for manage_session and evaluate_script. */

import { z } from "zod";

import { SCRIPT_MAX_CHARS } from "../scripting.js";
import { SESSION_ACTIONS } from "../session.js";

export const sessionActionField = z
  .enum(SESSION_ACTIONS)
  .describe(
    "set = add cookies/localStorage/headers; clear = drop all state and " +
      "rebuild a clean context; save = snapshot cookies + localStorage to " +
      "disk; load = restore a snapshot, then navigate to use it.",
  );

export const cookiesField = z
  .array(
    z
      .object({
        name: z.string(),
        value: z.string(),
        url: z.string().url().optional(),
        domain: z.string().optional(),
        path: z.string().optional(),
        expires: z.number().optional(),
        httpOnly: z.boolean().optional(),
        secure: z.boolean().optional(),
        sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
      })
      .refine((c) => Boolean(c.url) || Boolean(c.domain && c.path), {
        message: "each cookie needs either url, or both domain and path",
      }),
  )
  .optional()
  .describe(
    "Cookies in Playwright addCookies shape; each needs url, or domain+path.",
  );

export const localStorageField = z
  .array(
    z.object({
      origin: z.string().url(),
      items: z.array(z.object({ name: z.string(), value: z.string() })),
    }),
  )
  .optional()
  .describe(
    "localStorage to seed per origin, applied on the next navigation.",
  );

export const headersField = z
  .record(z.string())
  .optional()
  .describe(
    "Extra headers for every request, merged into any already set.",
  );

export const sessionNameField = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe(
    "Snapshot name under .agent-eyes/sessions/. Required for save and load.",
  );

export const scriptField = z
  .string()
  .min(1)
  .max(SCRIPT_MAX_CHARS)
  .describe(
    "JS to run in the page as an async function body: use await, and you " +
      "MUST `return` a JSON-serializable value. E.g. return document.title;",
  );
