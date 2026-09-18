/**
 * Pointer gestures: click, hover, and drag against raw VIEWPORT PIXEL
 * coordinates via Playwright's page.mouse — no selector. The agent reads the
 * coordinates off a screenshot, so these reach anything visible on screen
 * regardless of DOM structure (shadow DOM, canvas, WebGL, maps/charts,
 * drag-and-drop). Shared by interact_and_audit and run_interaction_sequence
 * through performAction.
 */

import type { Page } from "playwright-core";

import type { SequenceAction, StepParams } from "../types/interactions.js";
import { REFLOW_PAUSE_MS } from "../types/timeouts.js";
import { BrowserToolError, messageOf } from "./errors.js";

/** Default intermediate move steps for a drag, if the caller omits "steps". */
const DEFAULT_DRAG_STEPS = 10;

/**
 * Resolve and bounds-check a viewport pixel coordinate for a pointer_* action.
 * The agent reads coordinates off a screenshot, so the value must be present
 * and must land inside the current viewport — a point outside it would silently
 * miss. Returns the {x, y} pair, throwing an agent-readable error otherwise.
 */
function requirePoint(
  page: Page,
  action: string,
  x: number | undefined,
  y: number | undefined,
  xName: string,
  yName: string,
): { x: number; y: number } {
  if (typeof x !== "number" || typeof y !== "number") {
    throw new BrowserToolError(
      `Interaction failed: action "${action}" requires numeric "${xName}" ` +
        `and "${yName}" viewport pixel coordinates (read them off a screenshot).`,
    );
  }
  const size = page.viewportSize();
  if (size && (x < 0 || y < 0 || x > size.width || y > size.height)) {
    throw new BrowserToolError(
      `Interaction failed: point (${x}, ${y}) for "${action}" is outside the ` +
        `${size.width}x${size.height} viewport. Coordinates must come from a ` +
        "screenshot at the current viewport.",
    );
  }
  return { x, y };
}

/** Execute a pointer gesture against raw viewport coordinates via page.mouse. */
export async function pointerGesture(
  page: Page,
  step: StepParams & { action: SequenceAction },
): Promise<void> {
  try {
    switch (step.action) {
      case "pointer_click": {
        const { x, y } = requirePoint(page, "pointer_click", step.x, step.y, "x", "y");
        await page.mouse.click(x, y, { button: step.button ?? "left" });
        return;
      }
      case "pointer_hover": {
        const { x, y } = requirePoint(page, "pointer_hover", step.x, step.y, "x", "y");
        await page.mouse.move(x, y);
        await page.waitForTimeout(REFLOW_PAUSE_MS);
        return;
      }
      case "pointer_drag": {
        const from = requirePoint(
          page,
          "pointer_drag",
          step.startX,
          step.startY,
          "startX",
          "startY",
        );
        const to = requirePoint(
          page,
          "pointer_drag",
          step.endX,
          step.endY,
          "endX",
          "endY",
        );
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: step.steps ?? DEFAULT_DRAG_STEPS });
        await page.mouse.up();
        return;
      }
      default:
        return;
    }
  } catch (error) {
    if (error instanceof BrowserToolError) {
      throw error;
    }
    throw new BrowserToolError(
      `Interaction failed: ${step.action} could not complete — ${messageOf(error)}`,
    );
  }
}
