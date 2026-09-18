/**
 * BrowserSession — the public facade. It composes the stateful collaborators
 * (BrowserCore, its Encoder, and the CaptureStore) and exposes one thin method
 * per tool that delegates to the matching operation in ../ops. Keeping the
 * orchestration in ops/* and the shared state here means each file stays small
 * while call sites still read as session.capture(...), session.measureElement(...),
 * etc. A single process-wide instance is exported as `session`.
 */

import type { Encoder } from "./encoder.js";
import { BrowserCore } from "./core.js";
import { CaptureStore } from "./store.js";

import { capture, captureMatrix } from "../ops/capture.js";
import { captureElement } from "../ops/capture-element.js";
import { labelInteractives } from "../ops/label-interactives.js";
import { findBreakpoints } from "../ops/find-breakpoints.js";
import { measureLayoutShift } from "../ops/measure-layout-shift.js";
import { visualDiffRegions } from "../ops/visual-diff-regions.js";
import { layoutMatrix } from "../ops/layout.js";
import { interactAndAudit, runInteractionSequence } from "../ops/interact.js";
import { baseline } from "../ops/baseline.js";
import { measureElement } from "../ops/measure.js";
import { scanAccessibility } from "../ops/accessibility.js";
import { reviewDesign, extractStyleTokens } from "../ops/design.js";
import { extractSiteDesign } from "../ops/site-design.js";
import { manageSession } from "../ops/session.js";
import { evaluateScript } from "../ops/script.js";
import { mockRoute, waitForResponse } from "../ops/network.js";
import { generateGallery } from "../ops/gallery.js";
import { authenticateLogin } from "../ops/auth-login.js";
import { submit2faCode } from "../ops/auth-2fa.js";
import { enrollCredentials } from "../ops/enroll-credentials.js";
import { manageVault } from "../ops/manage-vault.js";
import { awaitHumanInteraction } from "../ops/human-interaction.js";
import { manageTabs } from "../ops/tabs.js";
import { verifyFix } from "../ops/verify.js";

type P<F> = F extends (session: BrowserSession, ...args: infer A) => infer R
  ? (...args: A) => R
  : never;

export class BrowserSession {
  readonly core = new BrowserCore();
  readonly store = new CaptureStore();

  /** The Chromium-as-codec encoder lives inside core (tied to the browser). */
  get encoder(): Encoder {
    return this.core.encoder;
  }

  // --- tool operations (thin delegation to ../ops) ------------------------
  capture: P<typeof capture> = (...a) => capture(this, ...a);
  captureMatrix: P<typeof captureMatrix> = (...a) => captureMatrix(this, ...a);
  captureElement: P<typeof captureElement> = (...a) => captureElement(this, ...a);
  labelInteractives: P<typeof labelInteractives> = (...a) =>
    labelInteractives(this, ...a);
  findBreakpoints: P<typeof findBreakpoints> = (...a) =>
    findBreakpoints(this, ...a);
  measureLayoutShift: P<typeof measureLayoutShift> = (...a) =>
    measureLayoutShift(this, ...a);
  visualDiffRegions: P<typeof visualDiffRegions> = (...a) =>
    visualDiffRegions(this, ...a);
  layoutMatrix: P<typeof layoutMatrix> = (...a) => layoutMatrix(this, ...a);
  interactAndAudit: P<typeof interactAndAudit> = (...a) =>
    interactAndAudit(this, ...a);
  baseline: P<typeof baseline> = (...a) => baseline(this, ...a);
  measureElement: P<typeof measureElement> = (...a) => measureElement(this, ...a);
  scanAccessibility: P<typeof scanAccessibility> = (...a) =>
    scanAccessibility(this, ...a);
  reviewDesign: P<typeof reviewDesign> = (...a) => reviewDesign(this, ...a);
  extractStyleTokens: P<typeof extractStyleTokens> = (...a) =>
    extractStyleTokens(this, ...a);
  extractSiteDesign: P<typeof extractSiteDesign> = (...a) =>
    extractSiteDesign(this, ...a);
  runInteractionSequence: P<typeof runInteractionSequence> = (...a) =>
    runInteractionSequence(this, ...a);
  manageSession: P<typeof manageSession> = (...a) => manageSession(this, ...a);
  evaluateScript: P<typeof evaluateScript> = (...a) => evaluateScript(this, ...a);
  mockRoute: P<typeof mockRoute> = (...a) => mockRoute(this, ...a);
  waitForResponse: P<typeof waitForResponse> = (...a) =>
    waitForResponse(this, ...a);
  generateGallery: P<typeof generateGallery> = (...a) =>
    generateGallery(this, ...a);
  authenticateLogin: P<typeof authenticateLogin> = (...a) =>
    authenticateLogin(this, ...a);
  submit2faCode: P<typeof submit2faCode> = (...a) => submit2faCode(this, ...a);
  enrollCredentials: P<typeof enrollCredentials> = (...a) =>
    enrollCredentials(this, ...a);
  manageVault: P<typeof manageVault> = (...a) => manageVault(this, ...a);
  awaitHumanInteraction: P<typeof awaitHumanInteraction> = (...a) =>
    awaitHumanInteraction(this, ...a);
  manageTabs: P<typeof manageTabs> = (...a) => manageTabs(this, ...a);
  verifyFix: P<typeof verifyFix> = (...a) => verifyFix(this, ...a);

  /** The URL currently loaded in the persistent page, if any. */
  currentUrl(): string | null {
    return this.core.currentUrl();
  }

  /** Tear down the browser. Safe to call multiple times. */
  close(): Promise<void> {
    return this.core.close();
  }
}

/** The one shared session for this server process. */
export const session = new BrowserSession();
