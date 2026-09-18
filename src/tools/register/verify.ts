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
        "Confirm a fix REACHED the deployed site rather than a stale local " +
        "tab. Reloads the URL by default, evaluates small measurable " +
        "assertions per element, and returns a per-check PASS/FAIL table of " +
        "measured vs expected plus an overall verdict — a failed verdict " +
        "marks the response an error, so verify-loops and CI catch it. This " +
        "is what catches \"the tool said fixed but production still has the " +
        "bug\".",
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
