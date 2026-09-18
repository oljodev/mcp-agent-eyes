/** Page health telemetry drained on every tool transaction. */

/** Cap per health category, so one error loop can't flood a response. */
export const MAX_HEALTH_ENTRIES = 15;

/**
 * Telemetry drained from the persistent page on every tool transaction.
 * Each response reports what happened since the previous response; buffers
 * are cleared after each drain so errors never leak across unrelated steps.
 */
export interface PageHealth {
  /** console.error(...) output from the page. */
  consoleErrors: string[];
  /** Uncaught exceptions / unhandled rejections in page scripts. */
  pageErrors: string[];
  /** Requests that never completed (DNS, refused, CORS, ...). */
  failedRequests: string[];
  /** Responses with HTTP status >= 400. */
  httpErrors: string[];
  /** Entries dropped beyond MAX_HEALTH_ENTRIES, per category. */
  dropped: number;
  /**
   * DOM sanity verdict: set when document.body exists but renders nothing
   * visible (crashed SPA bundle, white-screen-of-death). null when the check
   * did not apply (no page open, or page is about:blank).
   */
  blankPage: { blank: boolean; detail: string } | null;
}
