/** evaluate_script limits: snippet size, runtime ceiling, and result cap. */

/** Max characters of an evaluate_script snippet. */
export const SCRIPT_MAX_CHARS = 4000;

/** Wall-clock ceiling for an evaluate_script run before it gives up. */
export const EVAL_TIMEOUT_MS = 5_000;

/** Max characters of rendered evaluate_script JSON returned to the agent. */
export const EVAL_RESULT_MAX_CHARS = 8000;
