/** PASS/FAIL table formatting for verify_fix. */

import type { VerifyResult } from "../../types/verify.js";

export function formatVerifyResult(result: VerifyResult): string {
  const head = result.verdict
    ? `VERIFY PASSED — ${result.passed}/${result.total} checks on ${result.url} @ ${result.viewport}`
    : `VERIFY FAILED — ${result.failed}/${result.total} check(s) failed on ${result.url} @ ${result.viewport}`;
  const rows = result.checks.map((c) => {
    const mark = c.ok ? "✓" : "✗";
    return `  ${mark} ${c.selector} [${c.assert}] — measured ${c.measured}, expected ${c.expected}`;
  });
  const lines = [head, ...rows];
  if (!result.verdict) {
    lines.push(
      "The change did NOT fully land on the live page. Re-deploy and re-run, or " +
        "fix the failing selectors; reload is on by default so this reflects the " +
        "freshly fetched DOM.",
    );
  }
  if (result.savedTo) {
    lines.push(`Verdict saved → ${result.savedTo}`);
  }
  return lines.join("\n");
}
