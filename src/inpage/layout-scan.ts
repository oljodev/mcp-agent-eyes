import type { LayoutScan } from "../types/layout.js";

/**
 * Runs inside the page (must be self-contained — no outer-scope captures).
 * Pure getBoundingClientRect()/scroll-metric math across five rule sets:
 * viewport overflow, destructive overlaps, container overflow, text
 * clipping, and (on mobile) tap-target sizes. Document coordinates are used
 * throughout so a scrolled page measures identically to an unscrolled one.
 *
 * Every finding carries a unique, addressable selector (anchored at the
 * nearest stable id, :nth-of-type at every level, uniqueness asserted via
 * querySelectorAll) plus a human-readable label, so agents can act on
 * results without guessing which "div.card" was meant.
 */
export function scanLayoutInPage({
  vw,
  vh,
  checkTapTargets,
  ignore,
}: {
  vw: number;
  vh: number;
  checkTapTargets: boolean;
  ignore: string[];
}): LayoutScan {
  const MAX_ELEMENTS = 5_000;
  const MAX_CANDIDATES = 200;
  const MAX_OFFENDERS = 10;
  const MAX_OVERLAPS = 15;
  const MAX_CONTAINER_ISSUES = 10;
  const MAX_TEXT_CLIPS = 10;
  const MAX_TAP_VIOLATIONS = 15;
  const MIN_TAP_PX = 44;
  const EDGE_EPSILON = 1;

  // An element is suppressed when it matches an ignoreSelector OR sits inside
  // one (closest() covers self + ancestors), so "ignore the cookie banner"
  // also drops everything painted inside it. Invalid selectors fail safe (no
  // suppression). suppressed counts findings dropped this way, for reporting.
  const ignoreSel = (ignore ?? []).filter((s) => s && s.trim()).join(",");
  let suppressed = 0;
  function matchesIgnore(el: Element): boolean {
    if (!ignoreSel) {
      return false;
    }
    try {
      return el.closest(ignoreSel) !== null;
    } catch {
      return false;
    }
  }

  const root = document.scrollingElement ?? document.documentElement;
  const documentWidth = Math.ceil(root.scrollWidth);
  const documentHeight = Math.ceil(root.scrollHeight);
  const pageOverflowPx = Math.max(0, root.scrollWidth - root.clientWidth);
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  function cssEscape(value: string): string {
    return window.CSS && CSS.escape
      ? CSS.escape(value)
      : value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
  }

  function idIsUnique(id: string): boolean {
    try {
      return document.querySelectorAll(`#${cssEscape(id)}`).length === 1;
    } catch {
      return false;
    }
  }

  function nthOfType(el: Element): number {
    let n = 1;
    let sibling = el.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === el.tagName) {
        n++;
      }
      sibling = sibling.previousElementSibling;
    }
    return n;
  }

  /** Up to two plain (selector-safe) class names, for readability only. */
  function readableClasses(el: Element): string {
    const classes = Array.from(el.classList)
      .filter((c) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c))
      .slice(0, 2);
    return classes.length > 0 ? `.${classes.join(".")}` : "";
  }

  /**
   * Unique, addressable selector: anchored at the element itself or the
   * nearest ancestor with a verified-unique id (falling back to body), with
   * tag[.classes]:nth-of-type(n) at every level below the anchor. The
   * :nth-of-type chain makes the path structurally unique; a final
   * querySelectorAll assertion guards the edge cases, falling back to a
   * pure structural chain from body when classes interfere.
   */
  function uniqueSelector(el: Element): string {
    if (el.id && idIsUnique(el.id)) {
      return `${el.tagName.toLowerCase()}#${cssEscape(el.id)}`;
    }

    const segments: string[] = [];
    let anchor = "body";
    let cursor: Element | null = el;
    while (
      cursor &&
      cursor !== document.body &&
      cursor !== document.documentElement
    ) {
      if (cursor !== el && cursor.id && idIsUnique(cursor.id)) {
        anchor = `${cursor.tagName.toLowerCase()}#${cssEscape(cursor.id)}`;
        break;
      }
      segments.unshift(
        `${cursor.tagName.toLowerCase()}${readableClasses(cursor)}` +
          `:nth-of-type(${nthOfType(cursor)})`,
      );
      cursor = cursor.parentElement;
    }

    const candidate =
      segments.length > 0 ? `${anchor} > ${segments.join(" > ")}` : anchor;
    try {
      if (
        document.querySelectorAll(candidate).length === 1 &&
        document.querySelector(candidate) === el
      ) {
        return candidate;
      }
    } catch {
      // fall through to the structural chain
    }

    // Fallback: pure tag:nth-of-type chain from body — no ids, no classes.
    const plain: string[] = [];
    cursor = el;
    while (
      cursor &&
      cursor !== document.body &&
      cursor !== document.documentElement
    ) {
      plain.unshift(
        `${cursor.tagName.toLowerCase()}:nth-of-type(${nthOfType(cursor)})`,
      );
      cursor = cursor.parentElement;
    }
    return plain.length > 0 ? `body > ${plain.join(" > ")}` : "body";
  }

  /**
   * Human-readable handle for a finding: aria-label, data-testid, id, the
   * nearest heading's text, or the element's own text — first 30 chars.
   */
  function labelFor(el: Element): string {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) {
      return aria.trim().slice(0, 30);
    }
    const testId = el.getAttribute("data-testid");
    if (testId && testId.trim()) {
      return testId.trim().slice(0, 30);
    }
    if (el.id) {
      return el.id.slice(0, 30);
    }
    const heading = el.querySelector("h1,h2,h3,h4,h5,h6");
    const headingText = heading?.textContent?.trim().replace(/\s+/g, " ");
    if (headingText) {
      return headingText.slice(0, 30);
    }
    const own = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    return own.slice(0, 30);
  }

  function isRendered(el: Element): boolean {
    const style = getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  /**
   * Distinguishes a container's overflow that is REAL content breakage from
   * one caused only by decorative, absolutely/fixed-positioned descendants
   * (blurred glows, abs badges, negative-inset backdrops). Those bleed past
   * the box by design and are clipped or invisible — not a layout bug.
   *
   * Returns true (real) when either an in-flow descendant element actually
   * extends past the content box, or no descendant element exceeds it at all
   * (i.e. the overflow is in-flow text spilling its own box, like a nowrap
   * number wider than its card). Returns false (decorative) only when EVERY
   * descendant exceeding the box is absolutely/fixed-positioned.
   */
  function hasInFlowOverflow(el: Element, axisX: boolean, axisY: boolean): boolean {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const leftEdge = rect.left + (parseFloat(cs.borderLeftWidth) || 0);
    const topEdge = rect.top + (parseFloat(cs.borderTopWidth) || 0);
    const rightEdge = leftEdge + el.clientWidth;
    const bottomEdge = topEdge + el.clientHeight;
    const TOL = 2;
    let sawOverflowingDescendant = false;
    const kids = el.querySelectorAll("*");
    for (let i = 0; i < kids.length; i++) {
      const d = kids.item(i);
      if (!d) {
        continue;
      }
      const dr = d.getBoundingClientRect();
      if (dr.width <= 1 && dr.height <= 1) {
        continue;
      }
      const exceeds =
        (axisX && (dr.right > rightEdge + TOL || dr.left < leftEdge - TOL)) ||
        (axisY && (dr.bottom > bottomEdge + TOL || dr.top < topEdge - TOL));
      if (!exceeds) {
        continue;
      }
      sawOverflowingDescendant = true;
      const pos = getComputedStyle(d).position;
      if (pos !== "absolute" && pos !== "fixed") {
        return true; // an in-flow descendant really overflows
      }
    }
    return !sawOverflowingDescendant;
  }

  const allElements = Array.from(document.querySelectorAll("body *"));
  let truncated = allElements.length > MAX_ELEMENTS;
  const scanList = allElements.slice(0, MAX_ELEMENTS);

  // -- rule 1: viewport overflow ------------------------------------------------
  interface RawOffender {
    el: Element;
    absLeft: number;
    absRight: number;
    width: number;
  }
  const rawOffenders: RawOffender[] = [];
  for (const el of scanList) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      continue;
    }
    const absLeft = rect.left + scrollX;
    const absRight = rect.right + scrollX;
    if (absRight > vw + EDGE_EPSILON || absLeft < -EDGE_EPSILON) {
      if (isRendered(el)) {
        rawOffenders.push({ el, absLeft, absRight, width: rect.width });
      }
    }
  }
  // Report only the OUTERMOST offenders: a wide child usually drags every
  // ancestor wide too, and listing the whole chain buries the root cause.
  const offenderElements = new Set(rawOffenders.map((o) => o.el));
  const outermost = rawOffenders.filter((o) => {
    let parent = o.el.parentElement;
    while (parent) {
      if (offenderElements.has(parent)) {
        return false;
      }
      parent = parent.parentElement;
    }
    return true;
  });
  outermost.sort(
    (a, b) =>
      Math.max(b.absRight - vw, -b.absLeft) -
      Math.max(a.absRight - vw, -a.absLeft),
  );
  const offenders = outermost
    .filter((o) => {
      if (matchesIgnore(o.el)) {
        suppressed++;
        return false;
      }
      return true;
    })
    .slice(0, MAX_OFFENDERS)
    .map((o) => ({
    selector: uniqueSelector(o.el),
    label: labelFor(o.el),
    left: Math.round(o.absLeft),
    right: Math.round(o.absRight),
    width: Math.round(o.width),
    overflowPx: Math.round(Math.max(o.absRight - vw, -o.absLeft)),
  }));

  // -- rule 2: destructive overlaps ----------------------------------------------
  const STRUCTURAL_SELECTOR =
    "h1,h2,h3,h4,h5,h6,p,a,button,input,select,textarea,img,video,label,li,td,th," +
    '[role="button"],[role="link"]';
  const structuralAll = document.querySelectorAll(STRUCTURAL_SELECTOR);
  const candidates = Array.from(structuralAll)
    .filter(isRendered)
    .slice(0, MAX_CANDIDATES);
  truncated = truncated || structuralAll.length > MAX_CANDIDATES;

  /**
   * The nearest fixed/sticky ancestor (or the element itself), else null.
   * Fixed/sticky elements live OUTSIDE normal scroll flow: a paragraph
   * passing "under" a sticky header is correct behavior, not a collision.
   */
  function overlayRoot(el: Element): Element | null {
    let cursor: Element | null = el;
    while (cursor && cursor !== document.documentElement) {
      const position = getComputedStyle(cursor).position;
      if (position === "fixed" || position === "sticky") {
        return cursor;
      }
      cursor = cursor.parentElement;
    }
    return null;
  }

  const boxes = candidates.map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      el,
      overlayRoot: overlayRoot(el),
      left: rect.left + scrollX,
      top: rect.top + scrollY,
      right: rect.right + scrollX,
      bottom: rect.bottom + scrollY,
      width: rect.width,
      height: rect.height,
    };
  });

  const overlaps: LayoutScan["overlaps"] = [];
  for (let i = 0; i < boxes.length && overlaps.length < MAX_OVERLAPS; i++) {
    for (
      let j = i + 1;
      j < boxes.length && overlaps.length < MAX_OVERLAPS;
      j++
    ) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      // Touching or sub-pixel-grazing boxes are normal flow, not collisions.
      if (overlapX < 3 || overlapY < 3) {
        continue;
      }
      // Parent/child intersections are by definition intentional.
      if (a.el.contains(b.el) || b.el.contains(a.el)) {
        continue;
      }
      // Either partner suppressed by ignoreSelector → drop the whole pair.
      if (matchesIgnore(a.el) || matchesIgnore(b.el)) {
        suppressed++;
        continue;
      }
      // Fixed/sticky isolation: an overlay element (or anything inside one)
      // intersecting a normal in-flow element is sticky-header-over-content
      // behavior, not breakage. Flag the pair only when BOTH sides live in
      // overlay land (modal vs sticky nav, or two children of the same
      // fixed container clashing) or both are normal flow.
      if ((a.overlayRoot !== null) !== (b.overlayRoot !== null)) {
        continue;
      }
      // Inline siblings on a shared line box "intersect" by rounding noise;
      // require a meaningful 2D bite out of the smaller element.
      const smallerArea = Math.min(a.width * a.height, b.width * b.height);
      if (overlapX * overlapY < Math.max(16, smallerArea * 0.05)) {
        continue;
      }
      overlaps.push({
        selectorA: uniqueSelector(a.el),
        labelA: labelFor(a.el),
        selectorB: uniqueSelector(b.el),
        labelB: labelFor(b.el),
        rectA: {
          left: Math.round(a.left),
          top: Math.round(a.top),
          width: Math.round(a.width),
          height: Math.round(a.height),
        },
        rectB: {
          left: Math.round(b.left),
          top: Math.round(b.top),
          width: Math.round(b.width),
          height: Math.round(b.height),
        },
        overlapX: Math.round(overlapX),
        overlapY: Math.round(overlapY),
      });
    }
  }

  // -- rule 3: container overflow (children spill or clip) -----------------------
  const containerIssues: LayoutScan["containerIssues"] = [];
  for (const el of scanList) {
    if (containerIssues.length >= MAX_CONTAINER_ISSUES) {
      truncated = true;
      break;
    }
    if (el.childElementCount === 0) {
      continue;
    }
    const overX = el.scrollWidth > el.clientWidth + 2;
    const overY = el.scrollHeight > el.clientHeight + 2;
    if (!overX && !overY) {
      continue;
    }
    const style = getComputedStyle(el);
    if (style.display === "inline") {
      continue; // client* metrics are meaningless on inline boxes
    }
    // Real scroll containers are intentional UI, not bugs.
    if (
      /(auto|scroll|overlay)/.test(style.overflowX) ||
      /(auto|scroll|overlay)/.test(style.overflowY)
    ) {
      continue;
    }
    if (!isRendered(el)) {
      continue;
    }
    const clips =
      /(hidden|clip)/.test(style.overflowX) ||
      /(hidden|clip)/.test(style.overflowY);
    // Visible vertical overflow is normal document flow — line-box bleed
    // (descenders, line-height) or auto-growing content that simply makes the
    // page taller. Only flag vertical overflow when it is actually clipped
    // (content lost); horizontal overflow stays a bug either way. Kills false
    // positives like a heading whose line-height bleeds a few px past its box.
    if (overY && !overX && !clips) {
      continue;
    }
    // Ignore overflow caused solely by absolutely/fixed-positioned descendants
    // (decorative blurred glows, abs badges, negative-inset backdrops).
    if (!hasInFlowOverflow(el, overX, overY)) {
      continue;
    }
    if (matchesIgnore(el)) {
      suppressed++;
      continue;
    }
    containerIssues.push({
      selector: uniqueSelector(el),
      label: labelFor(el),
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      mode: clips ? "clips" : "spills",
      axis: overX && overY ? "both" : overX ? "horizontal" : "vertical",
    });
  }

  // -- rule 4: text truncation / clipping ------------------------------------------
  const TYPOGRAPHIC_SELECTOR =
    "h1,h2,h3,h4,h5,h6,p,span,a,li,td,th,dt,dd,label,button,figcaption," +
    "blockquote,small,strong,em,code";
  const textClips: LayoutScan["textClips"] = [];
  const typographicAll = document.querySelectorAll(TYPOGRAPHIC_SELECTOR);
  for (let i = 0; i < typographicAll.length; i++) {
    if (textClips.length >= MAX_TEXT_CLIPS) {
      truncated = true;
      break;
    }
    const el = typographicAll.item(i);
    if (!el || el.childElementCount > 0) {
      continue; // leaf text elements only
    }
    const text = (el.textContent ?? "").trim();
    if (!text || el.clientWidth === 0) {
      continue; // inline boxes report zero client metrics
    }
    const hiddenPx = el.scrollWidth - el.clientWidth;
    if (hiddenPx <= 1) {
      continue;
    }
    const style = getComputedStyle(el);
    // Only clipped text is *silently* lost; visible-overflow spill is
    // already reported by the viewport-overflow rule.
    if (
      !/(hidden|clip)/.test(style.overflowX) &&
      style.textOverflow !== "ellipsis"
    ) {
      continue;
    }
    if (!isRendered(el)) {
      continue;
    }
    if (matchesIgnore(el)) {
      suppressed++;
      continue;
    }
    textClips.push({
      selector: uniqueSelector(el),
      label: labelFor(el),
      textSnippet: text.slice(0, 40),
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      hiddenPx,
    });
  }

  // -- rule 5: mobile tap-target sizes ----------------------------------------------
  const tapTargetViolations: LayoutScan["tapTargetViolations"] = [];
  if (checkTapTargets) {
    const INTERACTIVE_SELECTOR =
      'a,button,input,select,textarea,[role="button"],[role="link"],' +
      '[role="checkbox"],[role="tab"]';
    const interactiveAll = document.querySelectorAll(INTERACTIVE_SELECTOR);
    for (let i = 0; i < interactiveAll.length; i++) {
      if (tapTargetViolations.length >= MAX_TAP_VIOLATIONS) {
        truncated = true;
        break;
      }
      const el = interactiveAll.item(i);
      if (!el || !isRendered(el)) {
        continue;
      }
      const style = getComputedStyle(el);
      // Inline text links are exempt (per WCAG's inline exception) —
      // flagging every link inside a paragraph would bury real violations.
      if (el.tagName === "A" && style.display === "inline") {
        continue;
      }
      // Logo / brand / icon links: an <a> whose visual target is a graphic
      // mark (svg or img) is a wordmark or icon, not a fat-finger nav control
      // sized to a tap grid. Exempt it so a 102x28 logo isn't a violation.
      if (el.tagName === "A" && el.querySelector("svg, img")) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width + 0.5 >= MIN_TAP_PX && rect.height + 0.5 >= MIN_TAP_PX) {
        continue;
      }
      if (matchesIgnore(el)) {
        suppressed++;
        continue;
      }
      tapTargetViolations.push({
        selector: uniqueSelector(el),
        label: labelFor(el),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
  }

  return {
    documentWidth,
    documentHeight,
    viewportWidth: vw,
    viewportHeight: vh,
    pageOverflowPx,
    offenders,
    overlaps,
    containerIssues,
    textClips,
    tapTargetViolations,
    tapTargetsChecked: checkTapTargets,
    elementsScanned: scanList.length,
    structuralElementsChecked: candidates.length,
    truncated,
    suppressedByIgnore: suppressed,
  };
}
