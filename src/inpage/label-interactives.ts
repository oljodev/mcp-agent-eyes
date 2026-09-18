import type { InteractiveMarkScan } from "../types/marks.js";

/**
 * Runs inside the page (must be self-contained — no outer-scope captures).
 * Finds every interactive node visible in the current viewport — links,
 * buttons, form controls, ARIA widgets, and anything with a computed
 * `cursor: pointer` — paints a small numbered high-contrast badge over each
 * (inside one removable container), and returns the legend mapping every
 * badge number to a unique, addressable selector + accessible label. The
 * caller screenshots WITH the badges, then removes the overlay, so the agent
 * can pick "[2]" off the image and act on its exact selector.
 */
export function labelInteractivesInPage(): InteractiveMarkScan {
  const MAX_MARKS = 60;
  const MAX_SCAN = 4000;

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

  function labelOf(el: Element): string {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim().slice(0, 40);
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim();
      if (text) return text.replace(/\s+/g, " ").slice(0, 40);
    }
    if (el.id) {
      try {
        const lab = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
        if (lab && (lab.textContent ?? "").trim())
          return lab.textContent!.trim().replace(/\s+/g, " ").slice(0, 40);
      } catch {
        /* unescapable id */
      }
    }
    const own = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (own) return own.slice(0, 40);
    const value = el.getAttribute("value");
    if (value && value.trim()) return value.trim().slice(0, 40);
    const placeholder = el.getAttribute("placeholder");
    if (placeholder && placeholder.trim()) return `(placeholder: ${placeholder.trim().slice(0, 30)})`;
    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim().slice(0, 40);
    const img = el.querySelector("img[alt]");
    const alt = img?.getAttribute("alt");
    if (alt && alt.trim()) return alt.trim().slice(0, 40);
    return "";
  }

  function tagOf(el: Element): string {
    const role = el.getAttribute("role");
    if (role && el.tagName !== "BUTTON" && el.tagName !== "A") return `role=${role}`;
    const t = el.tagName.toLowerCase();
    if (t === "input") return `input[${el.getAttribute("type") ?? "text"}]`;
    return t;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  function onScreen(rect: DOMRect): boolean {
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < vh &&
      rect.left < vw
    );
  }
  function isShown(el: Element): boolean {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) !== 0;
  }

  const EXPLICIT =
    'a[href],button,input:not([type="hidden"]),select,textarea,' +
    '[role="button"],[role="link"],[role="checkbox"],[role="tab"],' +
    '[role="menuitem"],[role="switch"],[role="radio"],[tabindex]:not([tabindex="-1"]),[onclick]';

  const set = new Set<Element>();
  for (const el of Array.from(document.querySelectorAll(EXPLICIT))) {
    if (el.getAttribute("aria-hidden") === "true") continue;
    if (!isShown(el)) continue;
    if (!onScreen(el.getBoundingClientRect())) continue;
    set.add(el);
  }

  // cursor:pointer elements that aren't already covered and don't wrap/another
  // candidate (keep the innermost clickable, skip clickable wrappers).
  let scanned = 0;
  const all = document.querySelectorAll("body *");
  for (let i = 0; i < all.length && scanned < MAX_SCAN; i++) {
    const el = all.item(i);
    if (!el || set.has(el)) continue;
    scanned++;
    if (el.getAttribute("aria-hidden") === "true") continue;
    const s = getComputedStyle(el);
    if (s.cursor !== "pointer") continue;
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) continue;
    if (!onScreen(el.getBoundingClientRect())) continue;
    // Skip if an ancestor is already a candidate (the wrapper owns the click),
    // or if it contains a candidate (prefer the inner one).
    let skip = false;
    for (const c of set) {
      if (c.contains(el) || el.contains(c)) {
        skip = true;
        break;
      }
    }
    if (!skip) set.add(el);
  }

  const candidates = Array.from(set);
  const truncated = candidates.length > MAX_MARKS;
  const chosen = candidates
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
    .slice(0, MAX_MARKS);

  // Paint the overlay.
  document.getElementById("__agent_eyes_marks__")?.remove();
  const container = document.createElement("div");
  container.id = "__agent_eyes_marks__";
  container.style.cssText =
    "position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483647;";

  const marks: InteractiveMarkScan["marks"] = [];
  chosen.forEach(({ el, rect }, i) => {
    const n = i + 1;
    marks.push({
      n,
      selector: uniqueSelectorOf(el),
      label: labelOf(el),
      tag: tagOf(el),
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
    // outline box
    const box = document.createElement("div");
    box.style.cssText = [
      "position:absolute",
      `left:${rect.left + window.scrollX}px`,
      `top:${rect.top + window.scrollY}px`,
      `width:${Math.max(0, rect.width - 2)}px`,
      `height:${Math.max(0, rect.height - 2)}px`,
      "border:1px solid rgba(224,49,47,0.9)",
      "border-radius:2px",
      "box-sizing:border-box",
    ].join(";");
    container.appendChild(box);
    // numbered badge at top-left
    const badge = document.createElement("div");
    badge.textContent = String(n);
    badge.style.cssText = [
      "position:absolute",
      `left:${rect.left + window.scrollX}px`,
      `top:${rect.top + window.scrollY}px`,
      "transform:translate(-1px,-1px)",
      "background:#e0312f",
      "color:#fff",
      "font:700 11px/1.2 ui-monospace,monospace",
      "padding:0 3px",
      "border-radius:3px",
      "box-shadow:0 0 0 1px #fff",
      "white-space:nowrap",
    ].join(";");
    container.appendChild(badge);
  });

  document.documentElement.appendChild(container);

  return { marks, candidates: candidates.length, truncated };
}
