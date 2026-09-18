/**
 * Runs inside the page (must be self-contained — no outer-scope captures).
 * Given viewport-relative points (the centers of changed regions from a visual
 * diff), resolve the meaningful element under each via elementsFromPoint() and
 * return its unique selector, label, tag, and document-coordinate box — so a
 * pixel difference becomes an addressable code target. Giant full-page wrappers
 * are skipped in favor of the smallest sensible element under the point.
 */
export function hitTestInPage(
  points: Array<{ cx: number; cy: number }>,
): Array<{
  selector: string;
  label: string;
  tag: string;
  box: { x: number; y: number; width: number; height: number };
} | null> {
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

  const vpArea = window.innerWidth * window.innerHeight;

  return points.map((pt) => {
    let stack: Element[] = [];
    try {
      stack = document.elementsFromPoint(pt.cx, pt.cy) as Element[];
    } catch {
      return null;
    }
    let chosen: Element | null = null;
    for (const el of stack) {
      const tag = el.tagName;
      if (tag === "HTML" || tag === "BODY") continue;
      if (el.id === "__agent_eyes_overlay__" || el.id === "__agent_eyes_marks__") continue;
      if (el.closest("#__agent_eyes_overlay__,#__agent_eyes_marks__")) continue;
      const rect = el.getBoundingClientRect();
      // Skip near-full-viewport wrappers; prefer the first tighter element.
      if (rect.width * rect.height > vpArea * 0.9) {
        if (!chosen) chosen = el; // remember as a fallback
        continue;
      }
      chosen = el;
      break;
    }
    if (!chosen) return null;
    const rect = chosen.getBoundingClientRect();
    return {
      selector: uniqueSelectorOf(chosen),
      label: labelFor(chosen),
      tag: chosen.tagName.toLowerCase(),
      box: {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  });
}
