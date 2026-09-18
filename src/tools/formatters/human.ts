/** Status-line formatting for await_human_interaction. */

import type { HumanInteractionResult } from "../../types/human.js";

const HEAD: Record<HumanInteractionResult["status"], string> = {
  completed: "HUMAN HANDOFF COMPLETE",
  cancelled: "HUMAN HANDOFF CANCELLED",
  timeout: "HUMAN HANDOFF TIMED OUT",
};

const NEXT: Record<HumanInteractionResult["status"], string> = {
  completed:
    "Next: the human finished (or the page reached the expected URL). Continue " +
    "your automation from here — capture_page_screenshot to see the page.",
  cancelled:
    "Next: the human declined to act. Do not retry the same step unless they " +
    "ask you to; consider an alternative path.",
  timeout:
    "Next: nobody completed the handoff in time. The browser window may not " +
    "have been visible, or the human is away — confirm the window is up and " +
    "re-run await_human_interaction (raise timeoutMs if they need longer).",
};

export function formatHandoffStatus(result: HumanInteractionResult): string {
  return [`${HEAD[result.status]} — now at ${result.url}`, NEXT[result.status]].join("\n");
}
