/** mock_route and wait_for_response operations. */

import type { Response } from "playwright-core";

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError, trimUrl } from "../browser/errors.js";
import { performAction } from "../browser/interactions.js";
import type { PageHealth } from "../types/health.js";
import type { SequenceAction, StepParams } from "../types/interactions.js";
import {
  RESPONSE_BODY_SNIPPET_MAX,
  type MockRoute,
  type MockRouteInput,
} from "../types/network.js";
import { WAIT_TIMEOUT_MS } from "../types/timeouts.js";

/**
 * Stub network responses for deterministic captures. add registers a
 * pattern → canned response (and stores it so it survives a crash); clear
 * removes stubs; list shows them. Only sub-resources of a reachable page can
 * be mocked — the top-level navigation still hits the real server.
 */
export function mockRoute(
  session: BrowserSession,
  input: MockRouteInput,
): Promise<{ summary: string; health: PageHealth }> {
  return session.core.runExclusive(async () => {
    const core = session.core;
    switch (input.action) {
      case "add": {
        if (!input.pattern) {
          throw new BrowserToolError('mock_route "add" requires a "pattern".');
        }
        const route: MockRoute = {
          pattern: input.pattern,
          status: input.status,
          contentType: input.contentType,
          body: input.body ?? "",
          headers: input.headers,
        };
        // Replace any existing stub for the same pattern.
        core.mockRoutes = core.mockRoutes.filter(
          (r) => r.pattern !== route.pattern,
        );
        core.mockRoutes.push(route);
        if (core.context) {
          await core.context.unroute(route.pattern).catch(() => undefined);
          await core.registerMock(core.context, route);
        }
        return {
          summary:
            `Mock added: ${route.pattern} → ${route.status} ${route.contentType}` +
            `${route.body ? ` (${route.body.length}-byte body)` : ""}. Only ` +
            "sub-resources of a reachable page are mocked; the top-level " +
            "navigation URL still hits the real server.",
          health: await core.drainHealth(),
        };
      }
      case "clear": {
        const before = core.mockRoutes.length;
        const targets = input.pattern
          ? core.mockRoutes.filter((r) => r.pattern === input.pattern)
          : core.mockRoutes;
        if (core.context) {
          for (const r of targets) {
            await core.context.unroute(r.pattern).catch(() => undefined);
          }
        }
        core.mockRoutes = input.pattern
          ? core.mockRoutes.filter((r) => r.pattern !== input.pattern)
          : [];
        return {
          summary: `Cleared ${before - core.mockRoutes.length} mock route(s).`,
          health: await core.drainHealth(),
        };
      }
      case "list": {
        if (core.mockRoutes.length === 0) {
          return {
            summary: "No mock routes active.",
            health: await core.drainHealth(),
          };
        }
        const lines = core.mockRoutes.map(
          (r) =>
            `  ${r.pattern} → ${r.status} ${r.contentType}` +
            `${r.body ? ` (${r.body.length}-byte body)` : ""}`,
        );
        return {
          summary: `${core.mockRoutes.length} mock route(s):\n${lines.join("\n")}`,
          health: await core.drainHealth(),
        };
      }
    }
  });
}

/**
 * Wait for a network response whose URL matches a pattern, optionally
 * arming the waiter BEFORE a triggering interaction (Promise race-free), and
 * report the response's status / type / size (+ optional body snippet).
 */
export function waitForResponse(
  session: BrowserSession,
  urlPattern: string,
  trigger:
    | ({ action: SequenceAction; selector?: string | undefined } & StepParams)
    | undefined,
  timeoutMs: number | undefined,
  includeBody: boolean,
): Promise<{ summary: string; health: PageHealth }> {
  return session.core.runExclusive(async () => {
    const page = session.core.activePage();
    const timeout = timeoutMs ?? WAIT_TIMEOUT_MS;

    // Buffer recently-seen URLs so a timeout can show the agent what DID
    // arrive (the usual cause is a slightly-off pattern).
    const seen: string[] = [];
    const onResp = (r: Response) => {
      if (seen.length < 25) {
        seen.push(`${r.status()} ${r.request().method()} ${trimUrl(r.url())}`);
      }
    };
    page.on("response", onResp);

    let response: Response;
    try {
      // Arm the waiter FIRST, then fire the trigger, so a fast response
      // can't land before we're listening.
      const respPromise = page.waitForResponse(
        (r) => matchUrl(r.url(), urlPattern),
        { timeout },
      );
      respPromise.catch(() => undefined); // avoid unhandled rejection if we bail
      if (trigger) {
        await performAction(page, trigger);
      }
      response = await respPromise;
    } catch (error) {
      if (error instanceof BrowserToolError) {
        throw error; // a failed trigger interaction
      }
      throw new BrowserToolError(
        `No response matching "${urlPattern}" within ${timeout}ms. ` +
          `${seen.length} response(s) seen` +
          (seen.length > 0 ? `: ${seen.slice(-8).join("; ")}` : "") +
          ".",
      );
    } finally {
      page.off("response", onResp);
    }

    const status = response.status();
    const method = response.request().method();
    const headers = response.headers();
    const contentType = headers["content-type"] ?? "(none)";
    let size = "unknown size";
    let snippet = "";
    try {
      const body = await response.body();
      size = `${body.length} bytes`;
      if (includeBody && /json|text|javascript|xml|html|csv/.test(contentType)) {
        snippet = `\nBody: ${body.toString("utf8").slice(0, RESPONSE_BODY_SNIPPET_MAX)}`;
      }
    } catch {
      // Some responses (redirects, opaque) have no readable body.
    }

    return {
      summary:
        `Response: ${status} ${method} ${trimUrl(response.url())}\n` +
        `  content-type: ${contentType}; size: ${size}${snippet}`,
      health: await session.core.drainHealth(),
    };
  });
}

/** Match a URL against a substring, or a `*`-glob pattern. */
function matchUrl(url: string, pattern: string): boolean {
  if (!pattern.includes("*")) {
    return url.includes(pattern);
  }
  const re = new RegExp(
    pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*"),
  );
  return re.test(url);
}
