/** Registers verify_fix — confirm a change reached the live deployed page. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  optionalViewportField,
  reloadField,
  urlField,
  verifyChecksField,
  verifySaveAsField,
} from "../../types/index.js";
import {
  assertionBlock,
  errorResult,
  finalize,
  metadataBlock,
  textBlock,
} from "../blocks.js";
import { formatVerifyResult } from "../formatters/verify.js";
import { healthBlock } from "../health-format.js";

export function registerVerifyTool(server: McpServer): void {
  server.registerTool(
    "verify_fix",
    {
      title: "Verify a change actually landed on the live page",
      description:
        "Confirm a fix REACHED the deployed site — not just a stale local tab. " +
        "Reloads the URL by default (so it reads the freshly deployed DOM) and " +
        "evaluates small, measurable assertions per element: noViewportOverflow " +
        "(right edge ≤ viewport width — the classic hero/H1-wider-than-screen " +
        "bug), minTapTarget (≥ px in both dimensions, default 44), fontSizeAtMost/" +
        "fontSizeAtLeast, exists/notExists. Returns a per-check PASS/FAIL table " +
        "with measured-vs-expected and an overall verdict; a failed verdict marks " +
        "the response as an error so CI / verify-loops catch it. This is what " +
        'catches "the tool said fixed but production still has the bug". Pass ' +
        "saveAs to snapshot the verdict under .agent-eyes/verify/. Page-health " +
        "block included.",
      inputSchema: {
        url: urlField,
        viewport: optionalViewportField,
        reload: reloadField,
        checks: verifyChecksField,
        saveAs: verifySaveAsField,
      },
    },
    async ({ url, viewport, reload, checks, saveAs }) => {
      try {
        const result = await session.verifyFix({ url, viewport, reload, checks, saveAs });
        const assertion = {
          ok: result.verdict,
          label: `${result.passed}/${result.total} checks passed`,
        };
        return finalize(
          [
            textBlock(formatVerifyResult(result)),
            assertionBlock(assertion),
            healthBlock(result.health),
            metadataBlock(),
          ],
          assertion,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
