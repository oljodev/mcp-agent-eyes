/**
 * Run an in-page JS snippet and render its JSON-serializable return value as
 * capped text. Shared by the standalone evaluate_script tool (src/ops/script.ts)
 * and the evaluate_script sequence step, so the wrapping, timeout, and result
 * rendering live in exactly one place.
 */

import type { Page } from "playwright-core";

import {
  EVAL_RESULT_MAX_CHARS,
  EVAL_TIMEOUT_MS,
} from "../types/scripting.js";
import { BrowserToolError, messageOf } from "./errors.js";

/**
 * Evaluate `script` in the page as an async function body (so it may use
 * `return` and `await` directly) and return its result rendered as capped,
 * pretty JSON text. Throws a BrowserToolError on an in-page throw, a
 * non-serializable return, or a timeout.
 */
export async function evaluateInPage(page: Page, script: string): Promise<string> {
  let value: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new BrowserToolError(
              `Script did not finish within ${EVAL_TIMEOUT_MS / 1000}s — ` +
                "it may be looping or awaiting something that never " +
                "resolves. (The in-page code keeps running until the page " +
                "is navigated or closed.)",
            ),
          ),
        EVAL_TIMEOUT_MS,
      );
    });
    // A string argument is evaluated as an expression; the IIFE lets the
    // snippet use `return` and `await` directly.
    const run = page.evaluate(`(async () => { ${script} })()`);
    value = await Promise.race([run, timeout]);
  } catch (error) {
    if (error instanceof BrowserToolError) {
      throw error;
    }
    // Covers both in-page throws and non-serializable returns; the message
    // from Playwright already names which.
    throw new BrowserToolError(`evaluate_script failed: ${messageOf(error)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return renderEvalResult(value);
}

/** Render an evaluate_script result as capped, pretty JSON text. */
export function renderEvalResult(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  let json: string | undefined;
  try {
    json = JSON.stringify(value, null, 2);
  } catch {
    return "[result is not JSON-serializable]";
  }
  if (json === undefined) {
    return "undefined";
  }
  if (json.length > EVAL_RESULT_MAX_CHARS) {
    return `${json.slice(0, EVAL_RESULT_MAX_CHARS)}\n… (truncated, ${json.length} chars total)`;
  }
  return json;
}
