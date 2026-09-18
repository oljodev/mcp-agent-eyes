/** Timeouts and reflow/settle pauses used across the browser engine. */

/** Maximum time to wait for a navigation to commit. */
export const NAVIGATION_TIMEOUT_MS = 30_000;

/** Maximum time to wait for an element to become actionable. */
export const ACTION_TIMEOUT_MS = 10_000;

/** Default ceiling for a wait_for_* / expect_* step before it gives up. */
export const WAIT_TIMEOUT_MS = 5_000;

/**
 * Maximum time for the Node-side reachability probe that runs before
 * navigating the persistent page. Probing first means a dead dev server is
 * reported without destroying the page state the agent has built up.
 */
export const PREFLIGHT_TIMEOUT_MS = 3_000;

/**
 * Best-effort time to wait for the network to go idle after navigation.
 * Expiry is not an error: pages with long-polling or websockets never go
 * idle, and we'd rather return a screenshot than hang.
 */
export const SETTLE_TIMEOUT_MS = 3_000;

/**
 * Pause after a viewport change or interaction so layouts can reflow and
 * CSS transitions can start before we measure or screenshot.
 */
export const REFLOW_PAUSE_MS = 250;

/**
 * Settle time after the programmatic scroll-to-top that precedes every
 * baseline save/diff, so scroll-linked effects (sticky headers, reveal
 * animations) land before the lossless capture.
 */
export const SCROLL_RESET_SETTLE_MS = 100;

/** Pause between steps of run_interaction_sequence, for layout reflows. */
export const SEQUENCE_STEP_PAUSE_MS = 150;

/**
 * After a login/2FA submit, a SPA often runs an async auth request and only
 * THEN tears down the form / client-side redirects. We re-classify the page
 * until the verdict is decisive or this grace period elapses, so a real
 * success isn't misread as "unknown" just because we looked mid-redirect.
 */
export const LOGIN_SETTLE_TIMEOUT_MS = 6_000;

/** Poll interval while waiting for the post-submit login state to settle. */
export const LOGIN_POLL_INTERVAL_MS = 200;

/** Upper bound on steps per run_interaction_sequence call. */
export const MAX_SEQUENCE_STEPS = 25;

/** Default time a human has to complete an await_human_interaction handoff. */
export const HUMAN_HANDOFF_TIMEOUT_MS = 180_000;

/** Hard ceiling on an await_human_interaction handoff wait. */
export const HUMAN_HANDOFF_MAX_MS = 600_000;

/** Poll interval while watching for the handoff's expectUrlContains match. */
export const HUMAN_URL_POLL_MS = 300;

/** Max time to wait for a chromium.connectOverCDP attach before failing. */
export const CDP_CONNECT_TIMEOUT_MS = 10_000;
