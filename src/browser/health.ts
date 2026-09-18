/**
 * Page health telemetry. Listeners on the persistent page buffer console
 * errors, uncaught exceptions, failed requests, and 4xx/5xx responses; every
 * tool transaction drains those buffers atomically so each response reports
 * exactly what happened since the previous response.
 */

import type { Page } from "playwright-core";

import { MAX_HEALTH_ENTRIES, type PageHealth } from "../types/health.js";
import { domSanityCheck } from "../inpage/dom-sanity.js";
import { trimUrl } from "./errors.js";

export class HealthMonitor {
  private consoleErrors: string[] = [];
  private pageErrors: string[] = [];
  private failedRequests: string[] = [];
  private httpErrors: string[] = [];
  private dropped = 0;

  private push(buffer: string[], entry: string): void {
    if (buffer.length >= MAX_HEALTH_ENTRIES) {
      this.dropped++;
      return;
    }
    buffer.push(entry);
  }

  /** Wire console/pageerror/requestfailed/response listeners onto a page. */
  attach(page: Page): void {
    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }
      const location = message.location();
      const where = location.url
        ? ` (${trimUrl(location.url)}:${location.lineNumber})`
        : "";
      this.push(this.consoleErrors, `${message.text().slice(0, 300)}${where}`);
    });

    page.on("pageerror", (error) => {
      this.push(this.pageErrors, String(error.message || error).slice(0, 300));
    });

    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText ?? "unknown failure";
      // Aborted requests are routine during navigations and SPA route
      // changes — reporting them would be pure noise.
      if (reason === "net::ERR_ABORTED") {
        return;
      }
      this.push(
        this.failedRequests,
        `${request.method()} ${trimUrl(request.url())} — ${reason}`,
      );
    });

    page.on("response", (response) => {
      if (response.status() >= 400) {
        this.push(
          this.httpErrors,
          `${response.status()} ${response.request().method()} ${trimUrl(response.url())}`,
        );
      }
    });
  }

  /**
   * Snapshot-and-clear the health buffers, plus a DOM sanity check. The caller
   * runs this inside the same exclusive queue slot as the operation it
   * accompanies, so concurrent tool calls cannot steal each other's telemetry.
   */
  async drain(page: Page | null, pageCrashed: boolean): Promise<PageHealth> {
    const health: PageHealth = {
      consoleErrors: this.consoleErrors.splice(0),
      pageErrors: this.pageErrors.splice(0),
      failedRequests: this.failedRequests.splice(0),
      httpErrors: this.httpErrors.splice(0),
      dropped: this.dropped,
      blankPage: null,
    };
    this.dropped = 0;

    if (
      page &&
      !page.isClosed() &&
      !pageCrashed &&
      page.url() !== "about:blank"
    ) {
      try {
        health.blankPage = await page.evaluate(domSanityCheck);
      } catch {
        // Page busy or mid-navigation — skip the check, don't fail the tool.
      }
    }
    return health;
  }
}
