/**
 * Interactions, waits, and assertions: the vocabulary shared by
 * interact_and_audit and run_interaction_sequence.
 */

import type { ViewportName } from "./viewports.js";

/**
 * User interactions supported by interact_and_audit and as sequence steps.
 * Three families: gestures (do something), waits (block until a condition
 * holds, or time out), and a selector exists only for the gesture/wait that
 * needs one. Selectors are Playwright locators: plain CSS, or the engine
 * prefixes `text=` and `role=` for accessibility-first targeting.
 */
export const INTERACTION_ACTIONS = [
  // gestures
  "click",
  "type",
  "hover",
  "scroll_down",
  "scroll_up",
  "select",
  "check",
  "uncheck",
  "press",
  "clear",
  "focus",
  "scroll_into_view",
  // pointer gestures (viewport pixel coordinates, no selector)
  "pointer_click",
  "pointer_hover",
  "pointer_drag",
  // waits
  "wait_for",
  "wait_for_text",
  "wait_for_network",
  "wait_for_url",
  "wait_for_response",
] as const;

export type InteractionAction = (typeof INTERACTION_ACTIONS)[number];

/**
 * Assertions usable as sequence steps (not single interactions): they check a
 * condition and record pass/fail WITHOUT aborting the flow, so one
 * run_interaction_sequence call can both drive AND verify, failing closed
 * (isError) if any check is false.
 */
export const SEQUENCE_ACTIONS = [
  ...INTERACTION_ACTIONS,
  "expect_visible",
  "expect_hidden",
  "expect_text",
  "expect_count",
  // reads structured state out of the page (cheaper than a screenshot)
  "evaluate_script",
] as const;

export type SequenceAction = (typeof SEQUENCE_ACTIONS)[number];

/** Element lifecycle states a `wait_for` step can block on. */
export const WAIT_STATES = ["visible", "hidden", "attached", "detached"] as const;
export type WaitState = (typeof WAIT_STATES)[number];

/** Mouse button for a pointer_click. */
export const POINTER_BUTTONS = ["left", "right", "middle"] as const;
export type PointerButton = (typeof POINTER_BUTTONS)[number];

/**
 * Optional parameters a step may carry beyond action+selector. Each is used
 * by a specific subset of actions; performAction validates presence per
 * action and throws an agent-readable error when a required one is missing.
 */
export interface StepParams {
  /** type → text to fill; expect_text / wait_for_text → expected substring. */
  text?: string | undefined;
  /** press → key or chord, e.g. "Enter", "Escape", "Control+a". */
  key?: string | undefined;
  /** select → option value or visible label to choose. */
  value?: string | undefined;
  /** wait_for → element state to await (default "visible"). */
  state?: WaitState | undefined;
  /** wait_for_url / wait_for_response → substring the URL must contain. */
  urlContains?: string | undefined;
  /** expect_count → exact number of matches required. */
  count?: number | undefined;
  /**
   * wait_for_response → require this exact HTTP status (default: pass on any
   * status < 400, fail on >= 400).
   */
  expectStatus?: number | undefined;
  /** Override the default wait/expect timeout for this step. */
  timeoutMs?: number | undefined;
  /** pointer_click / pointer_hover → target X in viewport pixels. */
  x?: number | undefined;
  /** pointer_click / pointer_hover → target Y in viewport pixels. */
  y?: number | undefined;
  /** pointer_drag → press-down X in viewport pixels. */
  startX?: number | undefined;
  /** pointer_drag → press-down Y in viewport pixels. */
  startY?: number | undefined;
  /** pointer_drag → release X in viewport pixels. */
  endX?: number | undefined;
  /** pointer_drag → release Y in viewport pixels. */
  endY?: number | undefined;
  /** pointer_drag → number of intermediate move steps (default 10). */
  steps?: number | undefined;
  /** pointer_click → mouse button (default "left"). */
  button?: PointerButton | undefined;
  /** evaluate_script → JS body run in the page; must `return` a JSON value. */
  script?: string | undefined;
  /**
   * evaluate_script → optional name used to key this step's captured value in
   * the result so the caller can find it (falls back to the step index).
   */
  label?: string | undefined;
}

/** Arguments accepted by interact_and_audit. */
export interface InteractionRequest extends StepParams {
  action: InteractionAction;
  /** Required for element-targeted actions; omitted for page-level waits. */
  selector?: string | undefined;
  /**
   * Optional breakpoint to switch to (with a reflow settle) BEFORE the
   * selector is resolved and the action runs — so responsive-only elements
   * (hamburger menus, mobile drawers) can be targeted in one call.
   */
  viewport?: ViewportName | undefined;
}

/** The outcome of an expect_* step, surfaced as a pass/fail CI gate. */
export interface StepAssertion {
  /** 1-based step number in the sequence. */
  index: number;
  action: SequenceAction;
  selector: string | null;
  ok: boolean;
  detail: string;
}

/** The captured value of an evaluate_script step in a sequence. */
export interface ScriptStepResult {
  /** 1-based step number in the sequence. */
  index: number;
  /** The step's label, or null if it carried none (key by index then). */
  label: string | null;
  /** The JSON-serializable return value, rendered as capped pretty text. */
  value: string;
}

/** One step of a run_interaction_sequence pipeline. */
export interface SequenceStep extends StepParams {
  action: SequenceAction;
  /** Required for element-targeted actions; omitted for page-level steps. */
  selector?: string | undefined;
}
