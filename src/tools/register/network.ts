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
        "Stub matching requests with canned responses, so flaky or " +
        "third-party endpoints cannot change what you capture. add registers " +
        "a URL glob → {status, contentType, body, headers}; clear removes " +
        "stubs by pattern or all; list shows the active ones. Stubs are " +
        "context-level: they survive navigations and a crash until cleared. " +
        "Only sub-resources can be mocked, never the top-level navigation.",
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
        "its status, method, content-type and size, plus an optional body " +
        "snippet. An optional trigger interaction fires AFTER the waiter is " +
        "armed, so a fast response cannot be missed (click Save, await POST " +
        "/api/save). On timeout it lists the responses it did see, to help " +
        "fix the pattern. Acts on the open page.",
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
