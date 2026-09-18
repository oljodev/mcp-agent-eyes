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
        "Perform a user interaction on the CURRENTLY OPEN page in the " +
        "persistent browser session, then — after a 250ms reflow settle — " +
        "return BOTH a compressed webp screenshot AND a fresh text layout " +
        "audit (with unique, addressable selectors) of the resulting " +
        "state, so breakage caused by expanded menus, active tabs, or " +
        "opened modals is visible immediately. Gestures: click, type " +
        '(needs "text"), hover, scroll_down / scroll_up (a scroll-container ' +
        'selector, or the page itself via "body"), select (needs "value"), ' +
        'check, uncheck, press (needs "key"), clear, focus, ' +
        "scroll_into_view. Waits (block until true or time out): wait_for " +
        '("state" defaults to visible), wait_for_text (needs "text"), ' +
        'wait_for_network, wait_for_url (needs "urlContains"), and ' +
        "wait_for_response (needs \"urlContains\"; FAILS the call on a >= 400 " +
        'status, or != "expectStatus"). Pointer gestures act on raw VIEWPORT ' +
        "PIXEL coordinates (read off a screenshot) instead of a selector, so " +
        "they reach anything visible regardless of DOM structure — shadow " +
        "DOM, canvas, WebGL, maps/charts, and drag-and-drop: pointer_click " +
        '(needs "x","y"; optional "button" left/right/middle), pointer_hover ' +
        '(needs "x","y"), pointer_drag (needs "startX","startY","endX","endY"; ' +
        'optional "steps"). An ambiguous selector (matching more ' +
        "than one element) still acts on the first but is flagged in the " +
        'response. Pass "ignoreSelector" (string or array) to suppress known ' +
        "layout noise (a fixed sidebar, a cookie banner) from the audit. " +
        'Selectors accept Playwright text= and role= engines. Pass "viewport" to ' +
        "switch breakpoints (with a reflow settle) BEFORE the selector " +
        "resolves — e.g. click a mobile-only hamburger without a separate " +
        "resize call. The full-resolution render is saved into the current " +
        "run directory (consecutive interactions group together) and its " +
        "path reported. Use capture_page_screenshot first to open a page. " +
        "Includes a page-health block.",
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
        "High-speed batch pipeline for complex flows (filling forms, " +
        "opening nested menus): navigates to the URL, optionally matches a " +
        "viewport, then executes the steps array sequentially in one fast " +
        "local loop (150ms reflow pause between steps). Returns ONE " +
        "compressed webp screenshot and ONE text layout audit captured " +
        "after the FINAL step — a single compact bundle instead of " +
        "per-step screenshots, saving the tokens that chained " +
        "interact_and_audit calls would burn. The final render is saved to " +
        "the current run directory. Steps can mix gestures, waits, and " +
        "expect_* assertions, so one call can drive AND verify a flow: a " +
        "failing gesture/wait aborts with its index (earlier steps stay " +
        "applied and inspectable), while failing expect_* checks (and a " +
        "wait_for_response with a bad status) let the flow finish but mark the " +
        "whole response a FAILURE (isError). Steps can also be pointer " +
        "gestures (pointer_click, pointer_hover, pointer_drag) driven by " +
        "viewport pixel coordinates read off a screenshot — reaching shadow " +
        "DOM, canvas, WebGL, maps/charts, and drag-and-drop targets that have " +
        "no stable selector. An evaluate_script step (needs \"script\") reads " +
        "JSON-serializable page state (counts, text, attributes, computed " +
        "styles) into the result keyed by its \"label\" — observing the DOM " +
        "without an expensive screenshot. Pass \"ignoreSelector\" to suppress " +
        "known layout noise from the final audit. Includes a page-health block.",
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
