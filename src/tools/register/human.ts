/** Registers await_human_interaction — pause for a human takeover of the browser. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  expectUrlContainsField,
  handoffReasonField,
  handoffScreenshotField,
  handoffTimeoutField,
} from "../../types/index.js";
import { errorResult, imageBlock, metadataBlock, textBlock } from "../blocks.js";
import { formatHandoffStatus } from "../formatters/human.js";
import { healthBlock } from "../health-format.js";

export function registerHumanInteractionTool(server: McpServer): void {
  server.registerTool(
    "await_human_interaction",
    {
      title: "Hand the browser to the human to solve a challenge, then resume",
      description:
        "Hand the live browser to the human for something the AI cannot or " +
        "must not automate — a Cloudflare \"Verify you are human\" check, a " +
        "CAPTCHA, an interstitial. It never solves the challenge and never " +
        "bypasses anti-bot protection: it puts a window on screen, shows a " +
        "localhost prompt with your reason and a Done button, and BLOCKS " +
        "until the human clicks Done, the page reaches expectUrlContains, the " +
        "human cancels, or timeoutMs elapses. Returns status (completed | " +
        "cancelled | timeout) and the current url. The ONLY tool that shows a " +
        "window: managed mode browses invisibly and is relaunched visibly " +
        "here, so unsaved in-page state is lost. Headless mode returns a " +
        "clear error instead of hanging.",
      inputSchema: {
        reason: handoffReasonField,
        expectUrlContains: expectUrlContainsField,
        timeoutMs: handoffTimeoutField,
        screenshot: handoffScreenshotField,
      },
    },
    async ({ reason, expectUrlContains, timeoutMs, screenshot }) => {
      try {
        const result = await session.awaitHumanInteraction({
          reason,
          expectUrlContains,
          timeoutMs,
          screenshot,
        });
        return {
          content: [
            textBlock(formatHandoffStatus(result)),
            ...(result.image ? [imageBlock(result.image)] : []),
            healthBlock(result.health),
            metadataBlock(),
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
