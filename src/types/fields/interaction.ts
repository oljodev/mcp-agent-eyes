/** zod field schemas for interactions, waits, and sequence steps. */

import { z } from "zod";

import {
  INTERACTION_ACTIONS,
  POINTER_BUTTONS,
  SEQUENCE_ACTIONS,
  WAIT_STATES,
} from "../interactions.js";
import { MAX_SEQUENCE_STEPS, WAIT_TIMEOUT_MS } from "../timeouts.js";
import { SCRIPT_MAX_CHARS } from "../scripting.js";

const POINTER_NOTE =
  "pointer_* take viewport pixel coordinates read off a screenshot, so they " +
  "hit canvas, shadow DOM, and drag-and-drop targets that have no selector.";

export const actionField = z
  .enum(INTERACTION_ACTIONS)
  .describe(
    "What to do. Extra args in parens: type(text), select(value), " +
      "press(key), wait_for(state, default visible), wait_for_text(text), " +
      "wait_for_url(urlContains), wait_for_response(urlContains — fails the " +
      "call on status >= 400, or != expectStatus), pointer_click(x,y), " +
      "pointer_hover(x,y), pointer_drag(startX,startY,endX,endY). Waits block " +
      "until true or time out. " +
      POINTER_NOTE,
  );

export const selectorField = z
  .string()
  .min(1)
  .describe(
    "CSS selector for the target; first match wins. Playwright prefixes " +
      'work too (text="Log in", role=button[name="Submit"]). Use "body" to ' +
      "scroll the page itself.",
  );

export const optionalSelectorField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "CSS (or Playwright text=/role=) selector. Omit for page-level steps " +
      "such as wait_for_network, wait_for_url, or a page-wide expect_text.",
  );

export const textField = z
  .string()
  .optional()
  .describe(
    'Text payload: the value to fill for "type" (the field is cleared ' +
      'first), or the substring to match for "wait_for_text"/"expect_text".',
  );

export const keyField = z
  .string()
  .optional()
  .describe(
    'Key or chord for "press", e.g. "Enter", "Tab", "Control+a".',
  );

export const optionValueField = z
  .string()
  .optional()
  .describe(
    'Option for "select", matched on <option> value first, then its label.',
  );

export const waitStateField = z
  .enum(WAIT_STATES)
  .optional()
  .describe(
    'State for "wait_for" to block on. Default visible.',
  );

export const urlContainsField = z
  .string()
  .optional()
  .describe(
    'URL substring to match — the page URL for "wait_for_url", the request ' +
      'URL for "wait_for_response".',
  );

export const expectStatusField = z
  .number()
  .int()
  .min(100)
  .max(599)
  .optional()
  .describe(
    'Require this exact status for "wait_for_response". Omit to accept ' +
      "2xx/3xx and fail on >= 400.",
  );

export const countField = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe(
    'Exact match count required by "expect_count".',
  );

export const timeoutMsField = z
  .number()
  .int()
  .min(100)
  .max(60_000)
  .optional()
  .describe(
    `Timeout for a wait_for_*/expect_* step (default ${WAIT_TIMEOUT_MS}ms).`,
  );

const pixelCoord = (desc: string) =>
  z.number().int().min(0).max(20_000).optional().describe(desc);

export const pointerXField = pixelCoord("X in viewport pixels, off a screenshot.");

export const pointerYField = pixelCoord("Y in viewport pixels, off a screenshot.");

export const pointerStartXField = pixelCoord("Drag press-down X, viewport pixels.");

export const pointerStartYField = pixelCoord("Drag press-down Y, viewport pixels.");

export const pointerEndXField = pixelCoord("Drag release X, viewport pixels.");

export const pointerEndYField = pixelCoord("Drag release Y, viewport pixels.");

export const pointerStepsField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe(
    'Intermediate mouse-moves for "pointer_drag" (default 10). More steps ' +
      "registers with pickier drag-and-drop libraries.",
  );

export const pointerButtonField = z
  .enum(POINTER_BUTTONS)
  .optional()
  .describe(
    'Button for "pointer_click". Default left.',
  );

export const stepScriptField = z
  .string()
  .min(1)
  .max(SCRIPT_MAX_CHARS)
  .optional()
  .describe(
    'JS for "evaluate_script". Async function body: use await, and you MUST ' +
      "`return` a JSON-serializable value (no DOM nodes). Captured into the " +
      'result under "label". Far cheaper than a screenshot for counts, text, ' +
      'or computed styles. E.g. return document.querySelectorAll(".row").length.',
  );

export const stepLabelField = z
  .string()
  .min(1)
  .max(80)
  .optional()
  .describe(
    'Key for an "evaluate_script" step\'s value in the result. Defaults to ' +
      "the step number.",
  );

export const stepActionField = z
  .enum(SEQUENCE_ACTIONS)
  .describe(
    "Every interact_and_audit gesture and wait, plus expect_visible, " +
      "expect_hidden, expect_text(text), expect_count(count), and " +
      "evaluate_script(script), which reads page state without a screenshot. " +
      "A failed expect_* fails the call but the flow finishes; a failed " +
      "gesture or wait aborts there. Extra args per action: see the " +
      "interact_and_audit `action` field. " +
      POINTER_NOTE,
  );

export const stepSchema = z
  .object({
    action: stepActionField,
    selector: optionalSelectorField,
    text: textField,
    key: keyField,
    value: optionValueField,
    state: waitStateField,
    urlContains: urlContainsField,
    count: countField,
    expectStatus: expectStatusField,
    timeoutMs: timeoutMsField,
    x: pointerXField,
    y: pointerYField,
    startX: pointerStartXField,
    startY: pointerStartYField,
    endX: pointerEndXField,
    endY: pointerEndYField,
    steps: pointerStepsField,
    button: pointerButtonField,
    script: stepScriptField,
    label: stepLabelField,
  })
  .superRefine((step, ctx) => {
    const need = (keys: ("x" | "y" | "startX" | "startY" | "endX" | "endY")[]) => {
      for (const k of keys) {
        if (typeof step[k] !== "number") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `action "${step.action}" requires numeric "${k}" (viewport pixel coordinate)`,
            path: [k],
          });
        }
      }
    };
    if (step.action === "pointer_click" || step.action === "pointer_hover") {
      need(["x", "y"]);
    } else if (step.action === "pointer_drag") {
      need(["startX", "startY", "endX", "endY"]);
    } else if (step.action === "evaluate_script" && !step.script?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'action "evaluate_script" requires a "script"',
        path: ["script"],
      });
    }
  });

export const stepsField = z
  .array(stepSchema)
  .min(1)
  .max(MAX_SEQUENCE_STEPS)
  .describe(
    `Ordered steps run back-to-back (max ${MAX_SEQUENCE_STEPS}), with a ` +
      "reflow pause between each. ONE screenshot + audit is returned after " +
      "the last step, so a flow costs far less than one interact_and_audit " +
      "per step. A failing gesture or wait aborts at its index, earlier " +
      "steps stay applied; failed expect_* checks come back as a verdict.",
  );
