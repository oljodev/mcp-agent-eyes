/** Registers mock_route and wait_for_response. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  includeBodyField,
  mockActionField,
  mockBodyField,
  mockContentTypeField,
  mockHeadersField,
  mockPatternField,
  mockStatusField,
  timeoutMsField,
  triggerField,
  urlPatternField,
} from "../../types/index.js";
import { errorResult, metadataBlock, textBlock } from "../blocks.js";
import { healthBlock } from "../health-format.js";

export function registerNetworkTools(server: McpServer): void {
  server.registerTool(
    "mock_route",
    {
      title: "Stub network routes for deterministic captures",
      description:
        "Intercept matching requests and return a canned response, so flaky " +
        "or third-party endpoints don't change what you capture. action=add " +
        "registers a URL glob → {status, contentType, body, headers}; " +
        "action=clear removes stubs (by pattern, or all); action=list shows " +
        "active stubs. Stubs are context-level — they persist across " +
        "navigations and are re-applied after a crash, until cleared. NOTE: " +
        "only SUB-RESOURCES of a reachable page can be mocked (a reachability " +
        "preflight runs before the top-level navigation). Includes a " +
        "page-health block.",
      inputSchema: {
        action: mockActionField,
        pattern: mockPatternField,
        status: mockStatusField,
        contentType: mockContentTypeField,
        body: mockBodyField,
        headers: mockHeadersField,
      },
    },
    async ({ action, pattern, status, contentType, body, headers }) => {
      try {
        const { summary, health } = await session.mockRoute({
          action,
          pattern,
          status,
          contentType,
          body,
          headers,
        });
        return {
          content: [textBlock(summary), healthBlock(health), metadataBlock()],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "wait_for_response",
    {
      title: "Wait for a network response (optionally around a trigger)",
      description:
        "Wait for a network response whose URL matches a pattern, and report " +
        "its status, method, content-type, and size (plus an optional body " +
        "snippet). Pass an optional trigger interaction (click/type/…) — the " +
        "waiter is armed BEFORE the trigger fires, so a fast response can't " +
        "be missed (e.g. click Save and wait for POST /api/save). On timeout " +
        "it lists the responses it did see, to help fix the pattern. " +
        "Operates on the open page. Includes a page-health block.",
      inputSchema: {
        urlPattern: urlPatternField,
        trigger: triggerField,
        timeoutMs: timeoutMsField,
        includeBody: includeBodyField,
      },
    },
    async ({ urlPattern, trigger, timeoutMs, includeBody }) => {
      try {
        const { summary, health } = await session.waitForResponse(
          urlPattern,
          trigger,
          timeoutMs,
          includeBody,
        );
        return {
          content: [textBlock(summary), healthBlock(health), metadataBlock()],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
