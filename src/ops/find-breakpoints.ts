/** find_breakpoints: sweep viewport width and report where layout breaks. */

import type { BrowserSession } from "../browser/session.js";
import { applyViewport, navigateIfNeeded } from "../browser/navigation.js";
import { findOverflowInPage } from "../inpage/overflow-probe.js";
import type {
  BreakpointBand,
  BreakpointSweep,
  WidthSample,
} from "../types/breakpoints.js";
import type { PageHealth } from "../types/health.js";
import { REFLOW_PAUSE_MS } from "../types/timeouts.js";

/** Cap on probes per sweep, so a fine step over a wide range stays fast. */
const MAX_SAMPLES = 80;
/** Settle after each width change before probing (lighter than a full reflow). */
const SWEEP_SETTLE_MS = Math.min(120, REFLOW_PAUSE_MS);
/** Fixed probe height — overflow is a horizontal concern. */
const SWEEP_HEIGHT = 900;

/**
 * Step the viewport width from minWidth to maxWidth, probing horizontal
 * overflow at each stop, then collapse contiguous widths with the same health
 * signature into bands. Zero image tokens. The previously active viewport is
 * restored afterwards.
 */
export function findBreakpoints(
  session: BrowserSession,
  url: string,
  minWidth: number,
  maxWidth: number,
  step: number,
  reload = false,
): Promise<{ sweep: BreakpointSweep; health: PageHealth }> {
  return session.core.runExclusive(async () => {
    const before = session.core.currentViewport;
    const page = await session.core.ensurePage(before ?? "desktop");
    await navigateIfNeeded(session.core, page, url, { forceReload: reload });

    const lo = Math.min(minWidth, maxWidth);
    const hi = Math.max(minWidth, maxWidth);
    // Clamp the step so the sweep never exceeds MAX_SAMPLES probes.
    let effStep = Math.max(10, Math.round(step));
    if ((hi - lo) / effStep + 1 > MAX_SAMPLES) {
      effStep = Math.max(effStep, Math.ceil((hi - lo) / (MAX_SAMPLES - 1)));
    }

    const widths: number[] = [];
    for (let w = lo; w <= hi; w += effStep) widths.push(w);
    if (widths[widths.length - 1] !== hi) widths.push(hi);

    const samples: WidthSample[] = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: SWEEP_HEIGHT });
      await page.waitForTimeout(SWEEP_SETTLE_MS);
      let probe: {
        overflowPx: number;
        elementOverflowPx: number;
        selector: string | null;
        label: string | null;
      };
      try {
        probe = await page.evaluate(findOverflowInPage);
      } catch {
        probe = { overflowPx: 0, elementOverflowPx: 0, selector: null, label: null };
      }
      samples.push({
        width,
        overflowPx: probe.overflowPx,
        elementOverflowPx: probe.elementOverflowPx,
        selector: probe.selector,
        label: probe.label,
      });
    }

    // Restore the prior viewport (setViewportSize bypassed currentViewport).
    session.core.currentViewport = null;
    await applyViewport(session.core, page, before ?? "desktop");

    return {
      sweep: {
        minWidth: lo,
        maxWidth: hi,
        step: effStep,
        samples: samples.length,
        height: SWEEP_HEIGHT,
        bands: collapseBands(samples),
      },
      health: await session.core.drainHealth(),
    };
  });
}

/** Collapse consecutive samples sharing a health signature into bands. */
function collapseBands(samples: WidthSample[]): BreakpointBand[] {
  const bands: BreakpointBand[] = [];
  const sig = (s: WidthSample) => (s.overflowPx > 0 ? `overflow:${s.selector ?? "?"}` : "healthy");
  for (const s of samples) {
    const last = bands[bands.length - 1];
    const isOverflow = s.overflowPx > 0;
    if (last && sigOf(last) === sig(s)) {
      last.maxWidth = s.width;
      if (isOverflow) {
        last.maxElementOverflowPx = Math.max(last.maxElementOverflowPx, s.elementOverflowPx);
        last.maxDocOverflowPx = Math.max(last.maxDocOverflowPx, s.overflowPx);
      }
    } else {
      bands.push({
        minWidth: s.width,
        maxWidth: s.width,
        status: isOverflow ? "overflow" : "healthy",
        maxElementOverflowPx: isOverflow ? s.elementOverflowPx : 0,
        maxDocOverflowPx: isOverflow ? s.overflowPx : 0,
        selector: isOverflow ? s.selector : null,
        label: isOverflow ? s.label : null,
      });
    }
  }
  return bands;
}

function sigOf(band: BreakpointBand): string {
  return band.status === "overflow" ? `overflow:${band.selector ?? "?"}` : "healthy";
}
