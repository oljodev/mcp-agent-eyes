/** Registers interact_and_audit and run_interaction_sequence. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  actionField,
  expectStatusField,
  ignoreSelectorField,
  keyField,
  optionValueField,
  optionalSelectorField,
  optionalViewportField,
  pointerButtonField,
  pointerEndXField,
  pointerEndYField,
  pointerStartXField,
  pointerStartYField,
  pointerStepsField,
  pointerXField,
  pointerYField,
  reloadField,
  sizeModeField,
  stepsField,
  textField,
  timeoutMsField,
  urlContainsField,
  urlField,
  waitStateField,
} from "../../types/index.js";
import {
  type Assertion,
  assertionBlock,
  errorResult,
  finalize,
  imageBlock,
  kb,
  metadataBlock,
  persistenceBlock,
  textBlock,
  viewportLabel,
} from "../blocks.js";
import { healthBlock } from "../health-format.js";
import { formatSingleScan } from "../formatters/layout.js";
import { toSelectorList } from "../selectors.js";

/** A "⚠ N elements matched…" block, when an action used an ambiguous selector. */
function warningsBlock(warnings: string[]) {
  return textBlock(
    `[!] AMBIGUOUS SELECTOR:\n${warnings.map((w) => `      - ${w}`).join("\n")}`,
  );
}

export function registerInteractTools(server: McpServer): void {
  server.registerTool(
    "interact_and_audit",
    {
      title: "Interact with the page, then screenshot + audit",
      description:
        "Perform ONE interaction on the currently open page, then return a " +
        "webp screenshot AND a fresh text layout audit of the resulting " +
        "state, so breakage from an expanded menu, an active tab, or an " +
        "opened modal shows up immediately. Gestures, blocking waits, and " +
        "pointer gestures on viewport pixel coordinates are all available — " +
        "see `action` for what each one needs. An ambiguous selector acts on " +
        "the first match and says so. Pass viewport to switch breakpoints " +
        "before the selector resolves, ignoreSelector to mute known layout " +
        "noise. Open a page with capture_page_screenshot first.",
      inputSchema: {
        action: actionField,
        selector: optionalSelectorField,
        text: textField,
        key: keyField,
        value: optionValueField,
        state: waitStateField,
        urlContains: urlContainsField,
        expectStatus: expectStatusField,
        timeoutMs: timeoutMsField,
        x: pointerXField,
        y: pointerYField,
        startX: pointerStartXField,
        startY: pointerStartYField,
        endX: pointerEndXField,
        endY: pointerEndYField,
        steps: pointerStepsField,
        button: pointerButtonField,
        viewport: optionalViewportField,
        sizeMode: sizeModeField,
        ignoreSelector: ignoreSelectorField,
      },
    },
    async ({
      action,
      selector,
      text,
      key,
      value,
      state,
      urlContains,
      expectStatus,
      timeoutMs,
      x,
      y,
      startX,
      startY,
      endX,
      endY,
      steps,
      button,
      viewport: viewportArg,
      sizeMode,
      ignoreSelector,
    }) => {
      try {
        const { image, scan, viewport, saved, run, galleryPath, health, warnings, assertion: stepResult } =
          await session.interactAndAudit(
            { action, selector, text, key, value, state, urlContains, expectStatus, timeoutMs, x, y, startX, startY, endX, endY, steps, button, viewport: viewportArg },
            sizeMode,
            toSelectorList(ignoreSelector),
          );
        const currentUrl = session.currentUrl() ?? "the open page";
        const target = selector ? ` ${selector}` : "";
        const detail = `${action.replace(/_/g, " ")}${target}`;
        const switched = viewportArg
          ? ` (viewport switched to ${viewportLabel(viewportArg)} first)`
          : "";
        const content = [
          textBlock(
            `Page state after ${detail} on ${currentUrl}${switched} ` +
              `[${image.mimeType.replace("image/", "")}, ${image.width}x${image.height}px, ${kb(image.bytes)}]\n` +
              `saved → ${saved.file} (full-res ${saved.width}x${saved.height}px, ${kb(saved.bytes)})`,
          ),
          imageBlock(image),
          textBlock(formatSingleScan(scan, currentUrl, viewport)),
        ];
        if (warnings.length > 0) {
          content.push(warningsBlock(warnings));
        }
        // An assertion-shaped action (wait_for_response) fails the call.
        const assertion: Assertion | null = stepResult
          ? { ok: stepResult.ok, label: `${action} — ${stepResult.detail}` }
          : null;
        if (assertion) {
          content.push(assertionBlock(assertion));
        }
        content.push(
          persistenceBlock(run, galleryPath),
          healthBlock(health),
          metadataBlock(),
        );
        return finalize(content, assertion);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "run_interaction_sequence",
    {
      title: "Run a multi-step interaction sequence",
      description:
        "Batch pipeline for multi-step flows such as forms and nested menus: " +
        "navigates, optionally matches a viewport, then runs the steps in one " +
        "fast loop and returns ONE screenshot plus ONE layout audit after the " +
        "final step — far cheaper than chaining interact_and_audit. Steps mix " +
        "gestures, waits, expect_* assertions and evaluate_script, so a " +
        "single call can drive AND verify a flow. A failing gesture or wait " +
        "aborts at its index with earlier steps applied; failed expect_* " +
        "checks let the flow finish but mark the whole response a FAILURE.",
      inputSchema: {
        url: urlField,
        viewport: optionalViewportField,
        steps: stepsField,
        sizeMode: sizeModeField,
        reload: reloadField,
        ignoreSelector: ignoreSelectorField,
      },
    },
    async ({ url, viewport: viewportArg, steps, sizeMode, reload, ignoreSelector }) => {
      try {
        const { image, scan, viewport, assertions, scriptResults, saved, run, galleryPath, health, warnings } =
          await session.runInteractionSequence(
            url,
            steps,
            viewportArg,
            sizeMode,
            reload,
            toSelectorList(ignoreSelector),
          );
        const currentUrl = session.currentUrl() ?? url;
        const stepSummary = steps
          .map((step, i) => {
            const target = step.selector ? ` ${step.selector}` : "";
            const arg =
              step.action === "evaluate_script"
                ? ` (${step.label ?? "script"})`
                : step.text !== undefined
                  ? ` ("${step.text.slice(0, 30)}")`
                  : step.key !== undefined
                    ? ` [${step.key}]`
                    : step.value !== undefined
                      ? ` =${step.value}`
                      : "";
            return `${i + 1}. ${step.action}${target}${arg}`;
          })
          .join("; ");
        const content = [
          textBlock(
            `Completed ${steps.length}-step sequence on ${currentUrl}` +
              `${viewportArg ? ` at ${viewportLabel(viewportArg)}` : ""}: ${stepSummary} ` +
              `[${image.mimeType.replace("image/", "")}, ${image.width}x${image.height}px, ${kb(image.bytes)}]\n` +
              `saved → ${saved.file} (full-res ${saved.width}x${saved.height}px, ${kb(saved.bytes)})`,
          ),
          imageBlock(image),
          textBlock(formatSingleScan(scan, currentUrl, viewport)),
          persistenceBlock(run, galleryPath),
        ];
        if (warnings.length > 0) {
          content.push(warningsBlock(warnings));
        }

        // evaluate_script steps: captured page state, keyed by label (or step).
        if (scriptResults.length > 0) {
          const lines = scriptResults.map(
            (r) => `  ${r.label ?? `step ${r.index}`}: ${r.value}`,
          );
          content.push(
            textBlock(`SCRIPT RESULTS:\n${lines.join("\n")}`),
          );
        }

        // expect_* steps become a single pass/fail CI gate over the flow.
        let assertion: Assertion | null = null;
        if (assertions.length > 0) {
          const failed = assertions.filter((a) => !a.ok);
          const lines = assertions.map(
            (a) =>
              `  ${a.ok ? "✓" : "✗"} step ${a.index} ${a.action} — ${a.detail}`,
          );
          content.push(
            textBlock(
              `CHECKS (${assertions.length - failed.length}/${assertions.length} passed):\n` +
                lines.join("\n"),
            ),
          );
          assertion = {
            ok: failed.length === 0,
            label:
              failed.length === 0
                ? `all ${assertions.length} expect step(s) passed`
                : `${failed.length} of ${assertions.length} expect step(s) failed`,
          };
          content.push(assertionBlock(assertion));
        }

        content.push(healthBlock(health), metadataBlock());
        return finalize(content, assertion);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
