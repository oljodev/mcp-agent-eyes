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
  "pointer_* actions act on raw viewport pixel coordinates (read off a " +
  "screenshot) instead of a selector, so they reach anything visible on " +
  "screen regardless of DOM structure — shadow DOM, canvas, WebGL, and " +
  "drag-and-drop UIs that have no stable selector.";

export const actionField = z
  .enum(INTERACTION_ACTIONS)
  .describe(
    "The interaction to perform. Gestures: click, type (needs \"text\"), " +
      "hover, scroll_down, scroll_up, select (needs \"value\"), check, " +
      "uncheck, press (needs \"key\"), clear, focus, scroll_into_view. " +
      "Waits (block until true or time out): wait_for (element reaches " +
      '"state", default visible), wait_for_text (needs "text"), ' +
      "wait_for_network (network idle), wait_for_url (needs \"urlContains\"), " +
      "wait_for_response (needs \"urlContains\"; waits for a matching network " +
      "response and FAILS the call if its status is >= 400, or != " +
      '"expectStatus" when given). Pointer gestures (viewport pixel ' +
      'coordinates, no selector): pointer_click (needs "x","y"; optional ' +
      '"button"), pointer_hover (needs "x","y"), pointer_drag (needs ' +
      '"startX","startY","endX","endY"). ' +
      POINTER_NOTE,
  );

export const selectorField = z
  .string()
  .min(1)
  .describe(
    "CSS selector for the target element, e.g. button#submit or " +
      'input[name="email"]. The first match is used. Playwright engine ' +
      'prefixes also work: text="Log in" or role=button[name="Submit"] for ' +
      'accessibility-first targeting. To scroll the page itself, use "body".',
  );

export const optionalSelectorField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "CSS (or Playwright text=/role=) selector for the target element. " +
      "Optional: page-level steps (wait_for_network, wait_for_url, a " +
      "page-wide wait_for_text or expect_text, or a page-level press) omit " +
      "it.",
  );

export const textField = z
  .string()
  .optional()
  .describe(
    'Text payload. For "type", the value to fill (the field is cleared ' +
      'first). For "wait_for_text" / "expect_text", the substring that must ' +
      "appear. Ignored by other actions.",
  );

export const keyField = z
  .string()
  .optional()
  .describe(
    'Key or chord for the "press" action, e.g. "Enter", "Escape", "Tab", ' +
      '"ArrowDown", "Control+a". Required when action is "press".',
  );

export const optionValueField = z
  .string()
  .optional()
  .describe(
    'Option to choose for the "select" action — matched against the ' +
      "<option> value first, then its visible label. Required when action " +
      'is "select".',
  );

export const waitStateField = z
  .enum(WAIT_STATES)
  .optional()
  .describe(
    'Lifecycle state for "wait_for" to block on: visible (default), ' +
      "hidden, attached, or detached.",
  );

export const urlContainsField = z
  .string()
  .optional()
  .describe(
    'Substring to match in a URL. For "wait_for_url", the page URL must ' +
      'contain it (handy after a client-side route change). For ' +
      '"wait_for_response", the network request URL must contain it. Required ' +
      "for both.",
  );

export const expectStatusField = z
  .number()
  .int()
  .min(100)
  .max(599)
  .optional()
  .describe(
    'For "wait_for_response": require this exact HTTP status. Omit to pass ' +
      "on any 2xx/3xx and fail on >= 400 (e.g. catch a 502 that broke the UI).",
  );

export const countField = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe(
    'Exact number of matching elements required by "expect_count". ' +
      "Required when action is \"expect_count\".",
  );

export const timeoutMsField = z
  .number()
  .int()
  .min(100)
  .max(60_000)
  .optional()
  .describe(
    `Override the wait/expect timeout (default ${WAIT_TIMEOUT_MS}ms) for a ` +
      "wait_for_* or expect_* step.",
  );

const pixelCoord = (desc: string) =>
  z.number().int().min(0).max(20_000).optional().describe(desc);

export const pointerXField = pixelCoord(
  'Target X coordinate in viewport pixels for "pointer_click" / ' +
    '"pointer_hover". Required for those actions; read it off a screenshot.',
);

export const pointerYField = pixelCoord(
  'Target Y coordinate in viewport pixels for "pointer_click" / ' +
    '"pointer_hover". Required for those actions; read it off a screenshot.',
);

export const pointerStartXField = pixelCoord(
  'Press-down X (viewport pixels) where a "pointer_drag" begins. Required ' +
    "for pointer_drag.",
);

export const pointerStartYField = pixelCoord(
  'Press-down Y (viewport pixels) where a "pointer_drag" begins. Required ' +
    "for pointer_drag.",
);

export const pointerEndXField = pixelCoord(
  'Release X (viewport pixels) where a "pointer_drag" ends. Required for ' +
    "pointer_drag.",
);

export const pointerEndYField = pixelCoord(
  'Release Y (viewport pixels) where a "pointer_drag" ends. Required for ' +
    "pointer_drag.",
);

export const pointerStepsField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe(
    'Number of intermediate mouse-move steps for a "pointer_drag" (default ' +
      "10). More steps = smoother drag, which some drag-and-drop libraries " +
      "require to register the gesture.",
  );

export const pointerButtonField = z
  .enum(POINTER_BUTTONS)
  .optional()
  .describe(
    'Mouse button for "pointer_click": left (default), right (context ' +
      "menu), or middle.",
  );

export const stepScriptField = z
  .string()
  .min(1)
  .max(SCRIPT_MAX_CHARS)
  .optional()
  .describe(
    'JS for the "evaluate_script" step. Runs as an async function body (use ' +
      "await; you MUST `return` a JSON-serializable value — no DOM nodes, " +
      "functions, or circular refs). The return value is captured into the " +
      'result, keyed by "label". Lets a sequence READ structured page state ' +
      "(counts, text, attributes, computed styles) far more cheaply than a " +
      'screenshot. Example: return document.querySelectorAll(".row").length. ' +
      'Required when action is "evaluate_script".',
  );

export const stepLabelField = z
  .string()
  .min(1)
  .max(80)
  .optional()
  .describe(
    'Name to key an "evaluate_script" step\'s captured value under in the ' +
      "result, so you can find it among multiple script steps (falls back to " +
      "the step number if omitted).",
  );

export const stepActionField = z
  .enum(SEQUENCE_ACTIONS)
  .describe(
    "Step action. All interact_and_audit gestures and waits, PLUS " +
      "assertions that check state without aborting: expect_visible, " +
      "expect_hidden, expect_text (needs \"text\"), expect_count (needs " +
      '"count"). A failed expect_* marks the whole call a FAILURE (isError) ' +
      "but lets the flow finish so you still see the end state; a failed " +
      "gesture or wait aborts at that step. Also supports pointer gestures " +
      "(pointer_click, pointer_hover, pointer_drag) on viewport pixel " +
      'coordinates, and evaluate_script (needs "script") to capture ' +
      "JSON-serializable page state into the result without a screenshot. " +
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
    "Ordered steps executed back-to-back (max " +
      `${MAX_SEQUENCE_STEPS}), with a short reflow pause between each. ` +
      "Mix gestures, waits, and expect_* assertions to drive AND verify a " +
      "flow in one call. Only ONE screenshot + layout audit is returned, " +
      "after the final step — far cheaper than one interact_and_audit call " +
      "per step. A failing gesture/wait aborts with its index (earlier " +
      "steps stay applied); failing expect_* checks are collected and " +
      "surfaced as a pass/fail verdict.",
  );
