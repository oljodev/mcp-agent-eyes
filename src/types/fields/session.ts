/** zod field schemas for manage_session and evaluate_script. */

import { z } from "zod";

import { SCRIPT_MAX_CHARS } from "../scripting.js";
import { SESSION_ACTIONS } from "../session.js";

export const sessionActionField = z
  .enum(SESSION_ACTIONS)
  .describe(
    "set = add cookies / localStorage / headers to the session; clear = drop " +
      "all session state and rebuild a clean context; save = snapshot the " +
      "current cookies + localStorage to disk under a name; load = restore a " +
      "saved snapshot (recreates the context, then navigate to use it).",
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
    "Cookies to add (Playwright addCookies shape). Each needs either url, or " +
      "both domain and path. Used by action set.",
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
    "localStorage entries to seed per origin, applied on the next " +
      "navigation/reload. Each: origin (e.g. http://localhost:5173) and " +
      "items [{name, value}]. Used by action set.",
  );

export const headersField = z
  .record(z.string())
  .optional()
  .describe(
    "Extra HTTP headers sent with every request (e.g. an Authorization " +
      "bearer token). Merged into previously-set headers. Used by action set.",
  );

export const sessionNameField = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe(
    "Snapshot name, stored as .agent-eyes/sessions/<name>.json. Required for " +
      "actions save and load.",
  );

export const scriptField = z
  .string()
  .min(1)
  .max(SCRIPT_MAX_CHARS)
  .describe(
    "JavaScript to run in the page. It runs as an async function body, so " +
      "you can use await and MUST `return` a JSON-serializable value (no DOM " +
      "nodes, functions, or circular refs). Example: return document.title;",
  );
