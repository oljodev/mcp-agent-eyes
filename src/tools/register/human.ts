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
        "Pause automation and hand the LIVE browser window to the human to do " +
        "something the AI cannot or must not automate — solve a Cloudflare " +
        '"Verify you are human" / Turnstile check, a CAPTCHA, or an ' +
        "interstitial. The AI never solves the challenge and never bypasses " +
        "anti-bot protection; it only puts a window on screen, shows the " +
        "human a localhost prompt with your `reason` + a Done button, and BLOCKS " +
        "until the first of: the human clicks Done, the page reaches " +
        "expectUrlContains (if set), the human clicks Cancel, or timeoutMs " +
        "elapses. Returns a status (completed | cancelled | timeout) + the " +
        "current url + a page-health block (and, if screenshot:true, an image of " +
        "the resulting page). This is the ONLY tool that shows the human a " +
        "browser window: managed mode (the default) browses invisibly and is " +
        "relaunched WITH a window here — same profile and logins, tabs reopened " +
        "on their URLs, so unsaved in-page state is lost. In pure headless mode " +
        "there is no window to give and it returns a clear error (never hangs).",
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
