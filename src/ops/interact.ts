/** interact_and_audit and run_interaction_sequence operations. */

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError, messageOf } from "../browser/errors.js";
import { applyViewport, navigateIfNeeded, settle } from "../browser/navigation.js";
import { performAction } from "../browser/interactions.js";
import { countLayoutIssues, runLayoutScan } from "../browser/layout-scan.js";
import { interactionLabel } from "../browser/paths.js";
import { rawScreenshot } from "../browser/screenshot.js";
import type { PageHealth } from "../types/health.js";
import {
  MATRIX_FORMAT,
  MATRIX_QUALITY,
  type EncodedImage,
  type RenderOptions,
  type SizeMode,
} from "../types/images.js";
import type {
  InteractionRequest,
  ScriptStepResult,
  SequenceStep,
  StepAssertion,
} from "../types/interactions.js";
import type { LayoutScan } from "../types/layout.js";
import type { RunInfo, SavedShot } from "../types/persistence.js";
import {
  REFLOW_PAUSE_MS,
  SEQUENCE_STEP_PAUSE_MS,
} from "../types/timeouts.js";
import { VIEWPORTS, type ViewportName } from "../types/viewports.js";

/**
 * Perform an interaction on the live page, wait for reflows to settle,
 * then return BOTH a compressed screenshot and a fresh layout scan of the
 * resulting state — so layout breakage caused by menus, tabs, or modals
 * is visible in the same turn as the interaction. Shots from consecutive
 * interactions are grouped into the same run directory.
 */
export function interactAndAudit(
  session: BrowserSession,
  request: InteractionRequest,
  sizeMode: SizeMode,
  ignoreSelector: string[] = [],
): Promise<{
  image: EncodedImage;
  scan: LayoutScan;
  viewport: ViewportName | null;
  saved: SavedShot;
  run: RunInfo;
  galleryPath: string;
  health: PageHealth;
  warnings: string[];
  assertion: { ok: boolean; detail: string } | null;
}> {
  return session.core.runExclusive(async () => {
    const page = session.core.activePage();

    // Viewport-aware interaction: resize (with the reflow settle inside
    // applyViewport) BEFORE resolving the selector, so responsive-only
    // elements like mobile hamburger menus exist when the action runs.
    if (request.viewport) {
      await applyViewport(session.core, page, request.viewport);
    }

    const warnings: string[] = [];
    const outcome = await performAction(page, request, (w) => warnings.push(w));
    // evaluate_script is a sequence-only step, never reachable from
    // interact_and_audit's action vocabulary — so only a verdict can appear.
    const assertion = outcome && "ok" in outcome ? outcome : null;

    // Let expanding menus / modals / transitions start and reflow land.
    await page.waitForTimeout(REFLOW_PAUSE_MS);
    await settle(page);

    const render: RenderOptions = {
      format: MATRIX_FORMAT,
      quality: MATRIX_QUALITY,
    };
    const raw = await rawScreenshot(page, false);
    const diskImage = await session.encoder.encode(raw.png, render);
    const chatImage = await session.encoder.chatVariant(
      raw.png,
      diskImage,
      render,
      sizeMode,
    );

    const viewport = session.core.currentViewport;
    const size =
      page.viewportSize() ??
      (viewport ? VIEWPORTS[viewport] : VIEWPORTS.desktop);
    const scan = await runLayoutScan(
      page,
      size,
      viewport === "mobile",
      ignoreSelector,
    );

    // Consecutive interactions share one run; if none is open (server
    // restarted mid-flow), start one.
    const run = await session.store.ensureRun(page.url());
    const saved = await session.store.saveShot(
      {
        tool: "interact",
        viewport: viewport ?? "desktop",
        url: page.url(),
        fragment: interactionLabel(request.action, request.selector),
        annotated: false,
        issueCount: countLayoutIssues(scan),
      },
      diskImage,
    );
    const galleryPath = await session.store.writeGallery();

    return {
      image: chatImage,
      scan,
      viewport,
      saved,
      run,
      galleryPath,
      health: await session.core.drainHealth(),
      warnings,
      assertion,
    };
  });
}

/**
 * Multi-step interaction pipeline: navigate, match the viewport, then run
 * every step back-to-back in one queue slot (150ms reflow pause between
 * steps), capturing ONE screenshot and ONE layout scan only after the
 * final step — one compact bundle instead of a screenshot per action.
 * A failing step aborts with its index; earlier steps remain applied and
 * the page stays in that state for inspection.
 */
export function runInteractionSequence(
  session: BrowserSession,
  url: string,
  steps: SequenceStep[],
  viewport: ViewportName | undefined,
  sizeMode: SizeMode,
  reload = false,
  ignoreSelector: string[] = [],
): Promise<{
  image: EncodedImage;
  scan: LayoutScan;
  viewport: ViewportName | null;
  assertions: StepAssertion[];
  scriptResults: ScriptStepResult[];
  saved: SavedShot;
  run: RunInfo;
  galleryPath: string;
  health: PageHealth;
  warnings: string[];
}> {
  return session.core.runExclusive(async () => {
    const target = viewport ?? session.core.currentViewport ?? "desktop";
    const page = await session.core.ensurePage(target);
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });

    const assertions: StepAssertion[] = [];
    const scriptResults: ScriptStepResult[] = [];
    const warnings: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      try {
        const result = await performAction(page, step, (w) =>
          warnings.push(`step ${i + 1}: ${w}`),
        );
        if (result && "scriptValue" in result) {
          scriptResults.push({
            index: i + 1,
            label: result.label ?? null,
            value: result.scriptValue,
          });
        } else if (result) {
          assertions.push({
            index: i + 1,
            action: step.action,
            selector: step.selector ?? null,
            ok: result.ok,
            detail: result.detail,
          });
        }
      } catch (error) {
        const detail = (
          error instanceof BrowserToolError ? error.message : messageOf(error)
        ).replace(/^(Interaction|Wait|Assertion) failed: /, "");
        const stepTarget = step.selector ? `"${step.selector}"` : "(page)";
        throw new BrowserToolError(
          `Sequence failed at step ${i + 1}/${steps.length} ` +
            `(${step.action} ${stepTarget}) — ${detail} ` +
            `Steps 1-${i} were executed; the page remains in that state, ` +
            "so you can inspect it with capture_page_screenshot or " +
            "continue with interact_and_audit.",
        );
      }
      await page.waitForTimeout(SEQUENCE_STEP_PAUSE_MS);
    }

    // Let the final step's menus/modals/transitions land.
    await page.waitForTimeout(REFLOW_PAUSE_MS);
    await settle(page);

    const render: RenderOptions = {
      format: MATRIX_FORMAT,
      quality: MATRIX_QUALITY,
    };
    const raw = await rawScreenshot(page, false);
    const diskImage = await session.encoder.encode(raw.png, render);
    const chatImage = await session.encoder.chatVariant(
      raw.png,
      diskImage,
      render,
      sizeMode,
    );

    const current = session.core.currentViewport;
    const size =
      page.viewportSize() ??
      (current ? VIEWPORTS[current] : VIEWPORTS.desktop);
    const scan = await runLayoutScan(
      page,
      size,
      current === "mobile",
      ignoreSelector,
    );

    const run = await session.store.ensureRun(page.url());
    const lastStep = steps[steps.length - 1]!;
    const saved = await session.store.saveShot(
      {
        tool: "interact",
        viewport: current ?? "desktop",
        url: page.url(),
        fragment: `seq${steps.length}-${interactionLabel(lastStep.action, lastStep.selector)}`,
        annotated: false,
        issueCount: countLayoutIssues(scan),
      },
      diskImage,
    );
    const galleryPath = await session.store.writeGallery();

    return {
      image: chatImage,
      scan,
      viewport: current,
      assertions,
      scriptResults,
      saved,
      run,
      galleryPath,
      health: await session.core.drainHealth(),
      warnings,
    };
  });
}
