/**
 * The interaction vocabulary: the single dispatch point (performAction) plus
 * its gesture helpers. Page-only — no session state — so it is shared by
 * interact_and_audit, run_interaction_sequence, and wait_for_response.
 */

import type { Page } from "playwright-core";

import type { SequenceAction, StepParams } from "../types/interactions.js";
import { ACTION_TIMEOUT_MS, WAIT_TIMEOUT_MS } from "../types/timeouts.js";
import {
  BrowserToolError,
  formatInteractionError,
  messageOf,
} from "./errors.js";
import { evaluateInPage } from "./eval-in-page.js";
import { pointerGesture } from "./pointer.js";

/**
 * What a dispatched action reports back to the sequence runner:
 *  - an expect_* or wait_for_response verdict ({ ok, detail }),
 *  - an evaluate_script captured value ({ scriptValue, label }), or
 *  - null for plain gestures and waits (they either succeed or throw).
 */
export type ActionOutcome =
  | { ok: boolean; detail: string }
  | { scriptValue: string; label: string | undefined }
  | null;

async function actOnLocator(
  page: Page,
  kind: "click" | "hover",
  selector: string,
): Promise<void> {
  try {
    const locator = page.locator(selector).first();
    if (kind === "click") {
      await locator.click({ timeout: ACTION_TIMEOUT_MS });
    } else {
      await locator.hover({ timeout: ACTION_TIMEOUT_MS });
    }
  } catch (error) {
    throw new BrowserToolError(formatInteractionError(error, kind, selector));
  }
}

async function typeInto(
  page: Page,
  selector: string,
  text: string | undefined,
): Promise<void> {
  if (text === undefined) {
    throw new BrowserToolError(
      'Interaction failed: the "text" argument is required when action is "type".',
    );
  }
  try {
    // fill() clears the field and sets the value — far more reliable for
    // agents than emulating individual keystrokes into a stale value.
    await page
      .locator(selector)
      .first()
      .fill(text, { timeout: ACTION_TIMEOUT_MS });
  } catch (error) {
    throw new BrowserToolError(formatInteractionError(error, "type", selector));
  }
}

async function scrollPage(
  page: Page,
  selector: string,
  direction: 1 | -1,
): Promise<void> {
  let outcome: { found: boolean };
  try {
    outcome = await page.evaluate(
      ({ selector, direction }) => {
        const trimmed = selector.trim().toLowerCase();
        const wantsPage = trimmed === "body" || trimmed === "html";
        const root = document.scrollingElement ?? document.documentElement;

        if (!wantsPage) {
          const element = document.querySelector(selector);
          if (!element) {
            return { found: false };
          }
          const style = getComputedStyle(element);
          // Only true scroll containers scroll themselves; body/html with
          // height:100% app shells pass the scrollHeight test yet
          // scrollBy() on them is a silent no-op — those (and plain
          // overflowing boxes) fall through to the window below.
          const isScrollContainer =
            /(auto|scroll|overlay)/.test(style.overflowY) &&
            element.scrollHeight > element.clientHeight + 1;
          if (isScrollContainer) {
            element.scrollBy({
              top: direction * element.clientHeight * 0.8,
              behavior: "instant",
            });
            return { found: true };
          }
        }

        window.scrollBy({
          top: direction * (root.clientHeight || window.innerHeight) * 0.8,
          behavior: "instant",
        });
        return { found: true };
      },
      { selector, direction },
    );
  } catch (error) {
    throw new BrowserToolError(
      `Interaction failed: could not scroll "${selector}": ` +
        `${messageOf(error)} — scroll selectors must be plain CSS ` +
        '(use "body" to scroll the page itself).',
    );
  }
  if (!outcome.found) {
    throw new BrowserToolError(
      `Interaction failed: selector "${selector}" not found in the active ` +
        'DOM. Use "body" to scroll the page itself, or check the selector ' +
        "against the most recent screenshot.",
    );
  }
}

function requireSelector(action: string, selector: string | undefined): string {
  if (!selector || !selector.trim()) {
    throw new BrowserToolError(
      `Interaction failed: action "${action}" requires a "selector".`,
    );
  }
  return selector;
}

/**
 * Actions that act on locator(...).first(): a selector matching more than one
 * element is a silent footgun (it acts on whichever happens to be first). We
 * warn — but never abort — so an ambiguous selector is visible, not invisible.
 * expect_* (counting is intentional) and page-level waits are excluded.
 */
const FIRST_MATCH_ACTIONS = new Set<SequenceAction>([
  "click",
  "hover",
  "type",
  "scroll_down",
  "scroll_up",
  "select",
  "check",
  "uncheck",
  "press",
  "clear",
  "focus",
  "scroll_into_view",
  "wait_for",
]);

/** Warn (via onWarn) when a first-match action's selector is ambiguous. */
async function warnIfAmbiguous(
  page: Page,
  action: SequenceAction,
  selector: string | undefined,
  onWarn: ((message: string) => void) | undefined,
): Promise<void> {
  if (!onWarn || !selector || !selector.trim() || !FIRST_MATCH_ACTIONS.has(action)) {
    return;
  }
  try {
    const matches = await page.locator(selector).count();
    if (matches > 1) {
      onWarn(
        `selector "${selector}" matched ${matches} elements — acted on the ` +
          "first. Pass a more specific selector (an id, :nth-match(), or an " +
          'exact quoted text="…" locator) to disambiguate.',
      );
    }
  } catch {
    // A selector that can't even be counted will surface its own error when
    // the action runs; don't pre-empt that with a confusing warning.
  }
}

/**
 * The single dispatch point for every interaction, wait, and assertion —
 * shared by interact_and_audit and run_interaction_sequence so the
 * vocabulary stays defined in exactly one place.
 *
 * Gestures and waits return null (they either succeed or throw a
 * BrowserToolError, which aborts the surrounding flow). expect_* steps
 * never throw on a false result: they return a {ok, detail} verdict that
 * the sequence runner collects into a pass/fail CI gate, so a flow can
 * drive AND verify in one call.
 */
export async function performAction(
  page: Page,
  step: { action: SequenceAction; selector?: string | undefined } & StepParams,
  onWarn?: (message: string) => void,
): Promise<ActionOutcome> {
  const { action } = step;
  const sel = step.selector;
  const timeout = step.timeoutMs ?? WAIT_TIMEOUT_MS;
  const loc = (s: string) => page.locator(s).first();

  await warnIfAmbiguous(page, action, sel, onWarn);

  switch (action) {
    // --- gestures handled by the existing helpers ---
    case "click":
    case "hover":
      await actOnLocator(page, action, requireSelector(action, sel));
      return null;
    case "type":
      await typeInto(page, requireSelector(action, sel), step.text);
      return null;
    case "scroll_down":
      await scrollPage(page, requireSelector(action, sel), 1);
      return null;
    case "scroll_up":
      await scrollPage(page, requireSelector(action, sel), -1);
      return null;

    // --- pointer gestures (viewport pixel coordinates, no selector) ---
    case "pointer_click":
    case "pointer_hover":
    case "pointer_drag":
      await pointerGesture(page, step);
      return null;

    // --- read structured state out of the page (cheaper than a screenshot) ---
    case "evaluate_script": {
      if (step.script === undefined || !step.script.trim()) {
        throw new BrowserToolError(
          'Interaction failed: action "evaluate_script" requires a "script" ' +
            "(a JS function body that returns a JSON-serializable value).",
        );
      }
      // evaluateInPage throws a BrowserToolError on an in-page throw, a
      // non-serializable return, or a timeout — so a bad script fails the step
      // exactly like any other failing step.
      const scriptValue = await evaluateInPage(page, step.script);
      return { scriptValue, label: step.label };
    }

    // --- new gestures ---
    case "select": {
      const s = requireSelector(action, sel);
      if (step.value === undefined) {
        throw new BrowserToolError(
          'Interaction failed: action "select" requires a "value" (option ' +
            "value or visible label).",
        );
      }
      try {
        // Match the <option> value first; fall back to its visible label.
        try {
          await loc(s).selectOption(step.value, { timeout: ACTION_TIMEOUT_MS });
        } catch {
          await loc(s).selectOption(
            { label: step.value },
            { timeout: ACTION_TIMEOUT_MS },
          );
        }
      } catch (error) {
        throw new BrowserToolError(formatInteractionError(error, "select", s));
      }
      return null;
    }
    case "check":
    case "uncheck": {
      const s = requireSelector(action, sel);
      try {
        await loc(s)[action]({ timeout: ACTION_TIMEOUT_MS });
      } catch (error) {
        throw new BrowserToolError(formatInteractionError(error, action, s));
      }
      return null;
    }
    case "press": {
      if (!step.key) {
        throw new BrowserToolError(
          'Interaction failed: action "press" requires a "key" (e.g. ' +
            '"Enter", "Escape", "Control+a").',
        );
      }
      try {
        if (sel && sel.trim()) {
          await loc(sel).press(step.key, { timeout: ACTION_TIMEOUT_MS });
        } else {
          await page.keyboard.press(step.key);
        }
      } catch (error) {
        throw new BrowserToolError(
          formatInteractionError(error, "press", sel ?? "(page)"),
        );
      }
      return null;
    }
    case "clear":
    case "focus": {
      const s = requireSelector(action, sel);
      try {
        await loc(s)[action]({ timeout: ACTION_TIMEOUT_MS });
      } catch (error) {
        throw new BrowserToolError(formatInteractionError(error, action, s));
      }
      return null;
    }
    case "scroll_into_view": {
      const s = requireSelector(action, sel);
      try {
        await loc(s).scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS });
      } catch (error) {
        throw new BrowserToolError(
          formatInteractionError(error, "scroll_into_view", s),
        );
      }
      return null;
    }

    // --- waits (block until true, or throw on timeout) ---
    case "wait_for": {
      const s = requireSelector(action, sel);
      const state = step.state ?? "visible";
      try {
        await loc(s).waitFor({ state, timeout });
      } catch {
        throw new BrowserToolError(
          `Wait failed: "${s}" did not become ${state} within ${timeout}ms.`,
        );
      }
      return null;
    }
    case "wait_for_text": {
      if (step.text === undefined) {
        throw new BrowserToolError(
          'Wait failed: action "wait_for_text" requires a "text" substring.',
        );
      }
      try {
        await page.waitForFunction(
          ({ s, t }: { s: string | null; t: string }) => {
            const root = s ? document.querySelector(s) : document.body;
            return !!root && (root.textContent ?? "").includes(t);
          },
          { s: sel ?? null, t: step.text },
          { timeout },
        );
      } catch {
        const where = sel ? `within "${sel}"` : "on the page";
        throw new BrowserToolError(
          `Wait failed: text "${step.text}" did not appear ${where} within ${timeout}ms.`,
        );
      }
      return null;
    }
    case "wait_for_network":
      await page
        .waitForLoadState("networkidle", { timeout })
        .catch(() => {
          throw new BrowserToolError(
            `Wait failed: the network did not go idle within ${timeout}ms.`,
          );
        });
      return null;
    case "wait_for_response": {
      if (step.urlContains === undefined) {
        throw new BrowserToolError(
          'Wait failed: action "wait_for_response" requires a "urlContains" ' +
            "substring identifying the request.",
        );
      }
      const needle = step.urlContains;
      let status: number;
      try {
        const response = await page.waitForResponse(
          (r) => r.url().includes(needle),
          { timeout },
        );
        status = response.status();
      } catch {
        // No matching response at all is a hard wait failure (like the other
        // wait_* steps), distinct from a matching-but-bad-status soft fail.
        throw new BrowserToolError(
          `Wait failed: no network response with a URL containing "${needle}" ` +
            `arrived within ${timeout}ms.`,
        );
      }
      // A matching response with a bad status is an expect_*-style verdict:
      // the call is marked a FAILURE but the flow still finishes.
      const ok =
        step.expectStatus !== undefined
          ? status === step.expectStatus
          : status < 400;
      return {
        ok,
        detail:
          step.expectStatus !== undefined
            ? `response "${needle}" returned ${status}, expected ${step.expectStatus}`
            : `response "${needle}" returned ${status}${ok ? "" : " (>= 400)"}`,
      };
    }
    case "wait_for_url": {
      if (step.urlContains === undefined) {
        throw new BrowserToolError(
          'Wait failed: action "wait_for_url" requires a "urlContains" ' +
            "substring.",
        );
      }
      const needle = step.urlContains;
      try {
        await page.waitForURL((url) => url.href.includes(needle), { timeout });
      } catch {
        throw new BrowserToolError(
          `Wait failed: the URL never contained "${needle}" within ${timeout}ms ` +
            `(current: ${page.url()}).`,
        );
      }
      return null;
    }

    // --- assertions (collected, never abort the flow) ---
    case "expect_visible":
    case "expect_hidden": {
      const s = requireSelector(action, sel);
      const visible = await loc(s)
        .isVisible()
        .catch(() => false);
      const wantVisible = action === "expect_visible";
      return {
        ok: visible === wantVisible,
        detail: `"${s}" is ${visible ? "visible" : "hidden"}, expected ${wantVisible ? "visible" : "hidden"}`,
      };
    }
    case "expect_text": {
      if (step.text === undefined) {
        throw new BrowserToolError(
          'Assertion failed: action "expect_text" requires a "text" substring.',
        );
      }
      const content = await (sel ? loc(sel).textContent() : page.textContent("body"))
        .catch(() => null);
      const found = content !== null && content.includes(step.text);
      const where = sel ? `"${sel}"` : "the page";
      return {
        ok: found,
        detail: found
          ? `${where} contains "${step.text}"`
          : `${where} does not contain "${step.text}"`,
      };
    }
    case "expect_count": {
      const s = requireSelector(action, sel);
      if (step.count === undefined) {
        throw new BrowserToolError(
          'Assertion failed: action "expect_count" requires a "count".',
        );
      }
      const actual = await page.locator(s).count();
      return {
        ok: actual === step.count,
        detail: `"${s}" matched ${actual} element(s), expected ${step.count}`,
      };
    }
  }
  return null;
}
