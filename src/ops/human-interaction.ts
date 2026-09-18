/**
 * await_human_interaction — hand the live browser to the human to solve an
 * in-page challenge the AI cannot or must not automate (a Cloudflare Turnstile
 * / "Verify you are human" check, a CAPTCHA, an interstitial), then resume.
 *
 * The AI never solves the challenge and never bypasses anti-bot protection — it
 * only surfaces the window, asks the human (via the same loopback secure-prompt
 * channel used for secrets) to act, and blocks until the FIRST of: the human
 * clicks Done, the page reaches an expected URL, the human cancels, or it times
 * out.
 *
 * This is the ONLY tool that ever puts a Chrome window on the human's screen:
 * managed mode runs invisibly, so the handoff first relaunches that same
 * persistent profile WITH a window (Playwright can't switch a running browser to
 * headed). Pure headless modes have nothing to promote and are rejected.
 */

import type { Page } from "playwright-core";

import { securePrompt } from "../auth/secure-prompt.js";
import { BrowserToolError } from "../browser/errors.js";
import type { BrowserSession } from "../browser/session.js";
import type { EncodedImage } from "../types/images.js";
import {
  MATRIX_FORMAT,
  MATRIX_QUALITY,
  type RenderOptions,
} from "../types/images.js";
import type {
  HumanInteractionInput,
  HumanInteractionResult,
  HumanInteractionStatus,
} from "../types/human.js";
import {
  HUMAN_HANDOFF_MAX_MS,
  HUMAN_HANDOFF_TIMEOUT_MS,
  HUMAN_URL_POLL_MS,
} from "../types/timeouts.js";

export function awaitHumanInteraction(
  session: BrowserSession,
  input: HumanInteractionInput,
): Promise<HumanInteractionResult> {
  return session.core.runExclusive(async () => {
    session.core.activePage(); // a live session is required before a handoff

    // Managed mode browses with no window; give the human one to act in by
    // relaunching the same profile visibly (tabs are restored on their URLs).
    await session.core.ensureVisibleBrowser();

    // A visible browser is mandatory: a headless one has no window for the human
    // to act in, and Playwright can't switch a running browser to headed.
    if (!session.core.isHeaded()) {
      throw new BrowserToolError(
        "await_human_interaction needs a visible browser, but agent-eyes is " +
          "running in headless mode. For challenges like Cloudflare Turnstile, " +
          "set AGENT_EYES_BROWSER=managed — agent-eyes then runs a real Chrome " +
          "itself (clean fingerprint, no manual commands), invisible until a " +
          "handoff like this one gives it a window, and the human's own click " +
          "validates. Alternatives: AGENT_EYES_HEADED=1 (visible built-in " +
          "browser) or AGENT_EYES_CDP_URL (attach to a Chrome you launched). " +
          "Playwright cannot switch an already-running browser to headed.",
      );
    }

    // The relaunch replaced the page object, so take it after the promotion.
    const page = session.core.activePage();

    // The ONE place we surface the window: bring the AGENT's tab to the front so
    // the human sees the challenge to solve. (Normal ops never do this.)
    await page.bringToFront().catch(() => undefined);

    const timeout = Math.min(
      Math.max(input.timeoutMs ?? HUMAN_HANDOFF_TIMEOUT_MS, 1_000),
      HUMAN_HANDOFF_MAX_MS,
    );

    // One AbortController unwinds whichever waiters did NOT win the race.
    const abort = new AbortController();
    const human = securePrompt.request({
      kind: "handoff",
      message: input.reason,
      // Give the prompt a slightly longer TTL than our own timer so OUR timeout
      // governs the status (timeout vs the prompt's generic timeout error).
      ttlMs: timeout + 5_000,
      signal: abort.signal,
    });
    human.catch(() => undefined); // the race handles its rejection

    let timer: ReturnType<typeof setTimeout> | undefined;
    const candidates: Array<Promise<HumanInteractionStatus | "pending">> = [
      human
        .then((v) => (v === "cancel" ? "cancelled" : "completed") as HumanInteractionStatus)
        .catch(() => "pending" as const),
      new Promise<HumanInteractionStatus>((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeout);
        (timer as { unref?: () => void }).unref?.();
      }),
    ];
    if (input.expectUrlContains) {
      candidates.push(
        waitForUrlContains(session, input.expectUrlContains, abort.signal).catch(
          () => "pending" as const,
        ),
      );
    }

    let status: HumanInteractionStatus | "pending";
    try {
      status = await Promise.race(candidates);
    } finally {
      if (timer) clearTimeout(timer);
      abort.abort(); // free the prompt + stop the URL poll if they didn't win
    }
    // "pending" only appears if a waiter rejected; treat that as a timeout
    // rather than reporting a spurious success.
    const finalStatus: HumanInteractionStatus = status === "pending" ? "timeout" : status;

    const result: HumanInteractionResult = {
      status: finalStatus,
      url: page.url(),
      health: await session.core.drainHealth(),
    };
    if (input.screenshot && finalStatus === "completed") {
      result.image = await snapshot(session, page);
    }
    return result;
  });
}

/** Resolve once the page's URL contains the needle; reject if aborted. */
function waitForUrlContains(
  session: BrowserSession,
  needle: string,
  signal: AbortSignal,
): Promise<HumanInteractionStatus> {
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (signal.aborted) {
        reject(new Error("aborted"));
        return;
      }
      const page = session.core.page;
      if (page && !page.isClosed() && page.url().includes(needle)) {
        resolve("completed");
        return;
      }
      const timer = setTimeout(tick, HUMAN_URL_POLL_MS);
      (timer as { unref?: () => void }).unref?.();
    };
    tick();
  });
}

/** A cheap thumbnail of the current page (a challenge page is not a secret). */
async function snapshot(session: BrowserSession, page: Page): Promise<EncodedImage> {
  const png = await page.screenshot({ type: "png", animations: "disabled" });
  const render: RenderOptions = { format: MATRIX_FORMAT, quality: MATRIX_QUALITY };
  const diskImage = await session.encoder.encode(png, render);
  return session.encoder.chatVariant(png, diskImage, render, "thumb");
}
