/** zod field schemas for mock_route and wait_for_response. */

import { z } from "zod";

import { MOCK_ACTIONS } from "../network.js";
import {
  actionField,
  keyField,
  optionValueField,
  optionalSelectorField,
  textField,
  timeoutMsField,
  urlContainsField,
  waitStateField,
} from "./interaction.js";

export const urlPatternField = z
  .string()
  .min(1)
  .describe(
    "Match against response URLs: a substring, or a glob with * wildcards " +
      "(e.g. **/api/users or */graphql). The first matching response wins.",
  );

export const triggerField = z
  .object({
    action: actionField,
    selector: optionalSelectorField,
    text: textField,
    key: keyField,
    value: optionValueField,
    state: waitStateField,
    urlContains: urlContainsField,
    timeoutMs: timeoutMsField,
  })
  .optional()
  .describe(
    "Optional interaction to perform AFTER the response waiter is armed " +
      "(armed first to avoid races) — e.g. click a Save button that fires the " +
      "request. Same fields as interact_and_audit.",
  );

export const includeBodyField = z
  .boolean()
  .default(false)
  .describe(
    "If true, include a snippet of the response body (text-ish content " +
      "types only, capped). Default false to stay token-cheap.",
  );

export const mockActionField = z
  .enum(MOCK_ACTIONS)
  .describe(
    "add = stub a URL pattern with a canned response; clear = remove stubs " +
      "(by pattern, or all when pattern omitted); list = show active stubs.",
  );

export const mockPatternField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "URL glob to intercept (e.g. **/api/** or */analytics*). Required for " +
      "add; optional filter for clear. NOTE: only SUB-RESOURCES of a " +
      "reachable page can be mocked — the top-level navigation URL still hits " +
      "the real server (a reachability preflight runs before navigation).",
  );

export const mockStatusField = z
  .number()
  .int()
  .min(100)
  .max(599)
  .default(200)
  .describe("HTTP status for the stubbed response (default 200).");

export const mockContentTypeField = z
  .string()
  .default("application/json")
  .describe("Content-Type for the stubbed response (default application/json).");

export const mockBodyField = z
  .string()
  .optional()
  .describe("Response body for the stub (e.g. a JSON string). Omit for empty.");

export const mockHeadersField = z
  .record(z.string())
  .optional()
  .describe("Extra response headers for the stub.");
