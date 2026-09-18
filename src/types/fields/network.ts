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
    "Substring or * glob matched against response URLs (e.g. **/api/users). " +
      "First match wins.",
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
    "Interaction to run after the waiter is armed (avoiding a race), e.g. " +
      "click Save. Same fields as interact_and_audit.",
  );

export const includeBodyField = z
  .boolean()
  .default(false)
  .describe(
    "Include a capped snippet of the response body (text types only). " +
      "Default false.",
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
    "URL glob to intercept (e.g. **/api/**). Required for add, an optional " +
      "filter for clear. Only sub-resources can be mocked — the top-level " +
      "navigation still hits the real server.",
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
