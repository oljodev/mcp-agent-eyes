/**
 * Runs inside the page (must be self-contained — no outer-scope captures).
 * A lightweight horizontal-overflow probe for the responsive width sweep:
 * reports whether the document overflows its viewport width and, if so, the
 * single OUTERMOST element bleeding past the edge (with a unique selector and
 * how far past it extends). Far cheaper than the full layout scanner — it is
 * fired once per probed width.
 */
export function findOverflowInPage(): {
  /** Document-level horizontal scroll extent (root.scrollWidth - clientWidth). */
  overflowPx: number;
  /** How far the WORST single element bleeds past the edge (its own overflow). */
  elementOverflowPx: number;
  selector: string | null;
  label: string | null;
} {
  const MAX_SCAN = 4000;
  const root = document.scrollingElement ?? document.documentElement;
  const viewportWidth = root.clientWidth;
  const overflowPx = Math.max(0, Math.round(root.scrollWidth - viewportWidth));
  if (overflowPx <= 1) {
    return { overflowPx: 0, elementOverflowPx: 0, selector: null, label: null };
  }

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
  function nthOfType(node: Element): number {
    let n = 1;
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === node.tagName) n++;
      sibling = sibling.previousElementSibling;
    }
    return n;
  }
  function readableClasses(node: Element): string {
    const classes = Array.from(node.classList)
      .filter((c) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c))
      .slice(0, 2);
    return classes.length > 0 ? `.${classes.join(".")}` : "";
  }
  function uniqueSelectorOf(node: Element): string {
    if (node.id && idIsUnique(node.id)) {
      return `${node.tagName.toLowerCase()}#${cssEscape(node.id)}`;
    }
    const segments: string[] = [];
    let anchor = "body";
    let cursor: Element | null = node;
    while (cursor && cursor !== document.body && cursor !== document.documentElement) {
      if (cursor !== node && cursor.id && idIsUnique(cursor.id)) {
        anchor = `${cursor.tagName.toLowerCase()}#${cssEscape(cursor.id)}`;
        break;
      }
      segments.unshift(
        `${cursor.tagName.toLowerCase()}${readableClasses(cursor)}:nth-of-type(${nthOfType(cursor)})`,
      );
      cursor = cursor.parentElement;
    }
    return segments.length > 0 ? `${anchor} > ${segments.join(" > ")}` : anchor;
  }
  function labelFor(el: Element): string {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim().slice(0, 30);
    const testId = el.getAttribute("data-testid");
    if (testId && testId.trim()) return testId.trim().slice(0, 30);
    if (el.id) return el.id.slice(0, 30);
    const heading = el.querySelector("h1,h2,h3,h4,h5,h6");
    const headingText = heading?.textContent?.trim().replace(/\s+/g, " ");
    if (headingText) return headingText.slice(0, 30);
    return (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  }

  const els = document.querySelectorAll("body *");
  interface Off {
    el: Element;
    overflow: number;
  }
  const offenders: Off[] = [];
  const limit = Math.min(els.length, MAX_SCAN);
  for (let i = 0; i < limit; i++) {
    const el = els.item(i);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) continue;
    const past = Math.max(rect.right - viewportWidth, -rect.left);
    if (past <= 1) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) {
      continue;
    }
    offenders.push({ el, overflow: past });
  }
  if (offenders.length === 0) {
    return { overflowPx, elementOverflowPx: 0, selector: null, label: null };
  }
  // Keep only the outermost offenders (drop those with an offending ancestor).
  const offEls = new Set(offenders.map((o) => o.el));
  const outermost = offenders.filter((o) => {
    let p = o.el.parentElement;
    while (p) {
      if (offEls.has(p)) return false;
      p = p.parentElement;
    }
    return true;
  });
  outermost.sort((a, b) => b.overflow - a.overflow);
  const worst = outermost[0]!;
  return {
    overflowPx,
    elementOverflowPx: Math.round(worst.overflow),
    selector: uniqueSelectorOf(worst.el),
    label: labelFor(worst.el),
  };
}
