/** Registers audit: layout + accessibility + design + CLS in one report. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { session } from "../../browser/session.js";
import { countLayoutIssues } from "../../browser/layout-scan.js";
import {
  ignoreSelectorField,
  maxIssuesField,
  optionalViewportField,
  urlField,
} from "../../types/index.js";
import { MAX_HEALTH_ENTRIES, type PageHealth } from "../../types/health.js";
import {
  type Assertion,
  assertionBlock,
  errorResult,
  finalize,
  metadataBlock,
  textBlock,
  viewportLabel,
} from "../blocks.js";
import { healthBlock } from "../health-format.js";
import { toSelectorList } from "../selectors.js";
import { formatAccessibilityReport } from "../formatters/accessibility.js";
import { formatDesignReview } from "../formatters/design.js";
import { formatScanSections } from "../formatters/layout.js";
import { formatLayoutShift } from "../formatters/web-vitals.js";

/** Lines of detail kept per section so one noisy page cannot flood a reply. */
const DETAIL_LINE_CAP = 40;

interface Section {
  name: string;
  /** One-line verdict for the summary table; null when the check failed. */
  summary: string;
  /** Issues this section contributes to the total. */
  issues: number;
  detail: string[];
}

function mergeHealth(all: PageHealth[]): PageHealth {
  const cap = (xs: string[]): string[] => xs.slice(0, MAX_HEALTH_ENTRIES);
  const merged: PageHealth = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    dropped: 0,
    blankPage: null,
  };
  for (const h of all) {
    merged.consoleErrors.push(...h.consoleErrors);
    merged.pageErrors.push(...h.pageErrors);
    merged.failedRequests.push(...h.failedRequests);
    merged.httpErrors.push(...h.httpErrors);
    merged.dropped += h.dropped;
    merged.blankPage = h.blankPage ?? merged.blankPage;
  }
  const dedupe = (xs: string[]): string[] => cap([...new Set(xs)]);
  return {
    ...merged,
    consoleErrors: dedupe(merged.consoleErrors),
    pageErrors: dedupe(merged.pageErrors),
    failedRequests: dedupe(merged.failedRequests),
    httpErrors: dedupe(merged.httpErrors),
  };
}

function clip(lines: string[]): string[] {
  if (lines.length <= DETAIL_LINE_CAP) return lines;
  return [
    ...lines.slice(0, DETAIL_LINE_CAP),
    `  … ${lines.length - DETAIL_LINE_CAP} more line(s) — run the dedicated tool for the full report.`,
  ];
}

export function registerAuditTool(server: McpServer): void {
  server.registerTool(
    "audit",
    {
      title: "Full page audit (text-only)",
      description:
        "One call, zero images: cold-load CLS, layout diagnostics at all four " +
        "breakpoints, WCAG accessibility foundations, and design-system smells. " +
        "Returns a summary table (issue counts and a PASS/FAIL verdict) then " +
        "per-section findings with addressable selectors. Use the dedicated " +
        "tools to drill into one area. Always reloads the page (CLS needs a cold load).",
      inputSchema: {
        url: urlField,
        viewport: optionalViewportField,
        summaryOnly: z
          .boolean()
          .default(false)
          .describe("Return only the summary table, without per-section findings."),
        maxIssues: maxIssuesField,
        ignoreSelector: ignoreSelectorField,
      },
    },
    async ({ url, viewport, summaryOnly, maxIssues, ignoreSelector }) => {
      try {
        const sections: Section[] = [];
        const healths: PageHealth[] = [];
        const failures: string[] = [];
        const attempt = async (
          name: string,
          run: () => Promise<Section & { health: PageHealth }>,
        ): Promise<void> => {
          try {
            const { health, ...section } = await run();
            healths.push(health);
            sections.push(section);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(name);
            sections.push({
              name,
              summary: `could not run — ${message.split("\n")[0]}`,
              issues: 0,
              detail: [],
            });
          }
        };
        const view = viewport ?? "desktop";

        // CLS first: it reloads, so it sees the page cold, before the other
        // passes interact with it.
        await attempt("Layout shift (CLS)", async () => {
          const { result, viewport: used, health } =
            await session.measureLayoutShift(url, view);
          const bad = result.band !== "good";
          return {
            name: "Layout shift (CLS)",
            summary: `CLS ${result.cls.toFixed(4)} — ${result.band.toUpperCase()}`,
            issues: bad ? 1 : 0,
            detail: formatLayoutShift(result, url, used).split("\n"),
            health,
          };
        });

        await attempt("Layout", async () => {
          const { entries, health } = await session.layoutMatrix(
            url,
            false,
            false,
            toSelectorList(ignoreSelector),
          );
          const counts = entries.map((e) => countLayoutIssues(e.scan));
          const detail: string[] = [];
          for (const entry of entries) {
            const n = countLayoutIssues(entry.scan);
            if (n === 0) continue;
            detail.push(
              `== ${viewportLabel(entry.viewport)} — ${n} issue(s) ==`,
              ...formatScanSections(entry.scan).filter((l) => !l.includes("[OK]")),
            );
          }
          return {
            name: "Layout",
            summary:
              `${counts.reduce((a, b) => a + b, 0)} issue(s) — ` +
              entries.map((e, i) => `${e.viewport}=${counts[i]}`).join(", "),
            issues: counts.reduce((a, b) => a + b, 0),
            detail,
            health,
          };
        });

        await attempt("Accessibility", async () => {
          const { scan, viewport: used, health } =
            await session.scanAccessibility(url, view, false);
          const n =
            scan.imageIssues.length +
            scan.headingIssues.length +
            scan.nameIssues.length;
          return {
            name: "Accessibility",
            summary:
              `${n} issue(s) — ${scan.imageIssues.length} image, ` +
              `${scan.headingIssues.length} heading, ${scan.nameIssues.length} name`,
            issues: n,
            detail: formatAccessibilityReport(scan, url, used).split("\n"),
            health,
          };
        });

        await attempt("Design", async () => {
          const { review, viewport: used, health } = await session.reviewDesign(
            url,
            view,
            false,
          );
          return {
            name: "Design",
            summary: `${review.smells.length} smell(s)`,
            issues: review.smells.length,
            detail: formatDesignReview(review, url, used).split("\n"),
            health,
          };
        });

        if (failures.length === sections.length) {
          throw new Error(
            `Every audit pass failed. ${sections.map((s) => s.summary).join("; ")}`,
          );
        }

        const total = sections.reduce((n, s) => n + s.issues, 0);
        const lines: string[] = [
          `AUDIT — ${session.currentUrl() ?? url} @ ${view}` +
            "",
          "",
          ...sections.map((s) => `  ${s.issues === 0 && !failures.includes(s.name) ? "✓" : "✗"} ${s.name.padEnd(18)} ${s.summary}`),
          "",
          `Total: ${total} issue(s)` +
            (failures.length ? ` — ${failures.length} pass(es) could not run` : "") +
            `. Verdict: ${total === 0 && failures.length === 0 ? "PASS" : "FAIL"}.`,
        ];
        if (!summaryOnly) {
          for (const s of sections) {
            if (s.issues === 0 || s.detail.length === 0) continue;
            lines.push("", `───── ${s.name} ─────`, ...clip(s.detail));
          }
        }

        const content = [textBlock(lines.join("\n"))];
        const assertion: Assertion | null =
          maxIssues !== undefined
            ? {
                ok: total <= maxIssues && failures.length === 0,
                label: `${total} audit issue(s) ${total <= maxIssues ? "≤" : ">"} ${maxIssues} allowed`,
              }
            : null;
        if (assertion) content.push(assertionBlock(assertion));
        content.push(healthBlock(mergeHealth(healths)), metadataBlock());
        return finalize(content, assertion);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
