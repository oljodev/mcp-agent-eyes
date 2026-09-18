import type { AccessibilityScan } from "../types/accessibility.js";

/**
 * Runs inside the page (must be self-contained — no outer-scope captures).
 * Foundational WCAG audit across three rule sets:
 *
 *  1. <img> elements missing an alt attribute, or carrying an EMPTY alt
 *     without role="presentation"/"none" (undeclared decorative images);
 *  2. heading hierarchy breaks — a heading that skips a level relative to
 *     the previous heading (e.g. h2 → h4), or a document whose first
 *     heading starts deeper than h2;
 *  3. interactive controls (inputs, selects, textareas, buttons) with no
 *     computable accessible name: no aria-label, no resolving
 *     aria-labelledby, no associated/wrapping <label>, no name-giving
 *     content or value/title. Placeholders deliberately do NOT count.
 */
export function scanAccessibilityInPage(): AccessibilityScan {
  const MAX_IMAGE_ISSUES = 20;
  const MAX_HEADING_ISSUES = 15;
  const MAX_NAME_ISSUES = 20;

  // -- compact addressable-selector helpers (mirrors the layout scanner) --
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
      if (sibling.tagName === node.tagName) {
        n++;
      }
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
    while (
      cursor &&
      cursor !== document.body &&
      cursor !== document.documentElement
    ) {
      if (cursor !== node && cursor.id && idIsUnique(cursor.id)) {
        anchor = `${cursor.tagName.toLowerCase()}#${cssEscape(cursor.id)}`;
        break;
      }
      segments.unshift(
        `${cursor.tagName.toLowerCase()}${readableClasses(cursor)}` +
          `:nth-of-type(${nthOfType(cursor)})`,
      );
      cursor = cursor.parentElement;
    }
    return segments.length > 0 ? `${anchor} > ${segments.join(" > ")}` : anchor;
  }
  function isRendered(el: Element): boolean {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  let truncated = false;

  // -- rule 1: image alternates ----------------------------------------------------
  const imageIssues: AccessibilityScan["imageIssues"] = [];
  const images = document.querySelectorAll("img");
  for (let i = 0; i < images.length; i++) {
    if (imageIssues.length >= MAX_IMAGE_ISSUES) {
      truncated = true;
      break;
    }
    const img = images.item(i);
    if (!img || img.getAttribute("aria-hidden") === "true") {
      continue;
    }
    const role = img.getAttribute("role");
    const declaredDecorative = role === "presentation" || role === "none";
    const alt = img.getAttribute("alt");
    const src = (img.getAttribute("src") ?? "").slice(0, 80);
    if (alt === null && !declaredDecorative) {
      imageIssues.push({
        selector: uniqueSelectorOf(img),
        kind: "missing-alt",
        src,
      });
    } else if (alt !== null && alt.trim() === "" && !declaredDecorative) {
      imageIssues.push({
        selector: uniqueSelectorOf(img),
        kind: "empty-alt-undeclared",
        src,
      });
    }
  }

  // -- rule 2: heading hierarchy -----------------------------------------------------
  const headingIssues: AccessibilityScan["headingIssues"] = [];
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
  // Start at 1 so an h1- or h2-first document passes, but a document whose
  // first heading is h3+ is flagged as starting too deep.
  let previousLevel = 1;
  let isFirstHeading = true;
  for (const heading of headings) {
    if (headingIssues.length >= MAX_HEADING_ISSUES) {
      truncated = true;
      break;
    }
    const level = Number(heading.tagName.slice(1));
    if (level > previousLevel + 1) {
      headingIssues.push({
        selector: uniqueSelectorOf(heading),
        level,
        previousLevel: isFirstHeading ? 0 : previousLevel,
        text: (heading.textContent ?? "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 40),
        kind: isFirstHeading ? "starts-too-deep" : "skipped-level",
      });
    }
    previousLevel = level;
    isFirstHeading = false;
  }

  // -- rule 3: accessible names -------------------------------------------------------
  const nameIssues: AccessibilityScan["nameIssues"] = [];
  const controls = document.querySelectorAll(
    'input:not([type="hidden"]),select,textarea,button,[role="button"]',
  );
  let controlsChecked = 0;
  for (let i = 0; i < controls.length; i++) {
    if (nameIssues.length >= MAX_NAME_ISSUES) {
      truncated = true;
      break;
    }
    const control = controls.item(i);
    if (
      !control ||
      control.getAttribute("aria-hidden") === "true" ||
      !isRendered(control)
    ) {
      continue;
    }
    controlsChecked++;

    const tag = control.tagName.toLowerCase();
    const typeAttr =
      tag === "input" ? (control.getAttribute("type") ?? "text") : null;
    const isButtonLike =
      tag === "button" || control.getAttribute("role") === "button";

    // -- accessible-name computation (foundational approximation) --
    const ariaLabel = control.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) {
      continue;
    }
    const labelledBy = control.getAttribute("aria-labelledby");
    let labelledByResolves = false;
    if (labelledBy) {
      labelledByResolves = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .some((node) => node !== null && (node.textContent ?? "").trim() !== "");
      if (labelledByResolves) {
        continue;
      }
    }
    if (control.id) {
      try {
        const label = document.querySelector(
          `label[for="${cssEscape(control.id)}"]`,
        );
        if (label && (label.textContent ?? "").trim()) {
          continue;
        }
      } catch {
        /* unescapable id — keep checking other naming paths */
      }
    }
    const wrappingLabel = control.closest("label");
    if (wrappingLabel && (wrappingLabel.textContent ?? "").trim()) {
      continue;
    }
    if (isButtonLike) {
      if ((control.textContent ?? "").trim()) {
        continue;
      }
      const namedImage = control.querySelector("img[alt]");
      if (namedImage && (namedImage.getAttribute("alt") ?? "").trim()) {
        continue;
      }
    }
    if (
      typeAttr === "submit" ||
      typeAttr === "reset" ||
      typeAttr === "button" ||
      typeAttr === "image"
    ) {
      const value = control.getAttribute("value");
      if (value && value.trim()) {
        continue;
      }
      const imgAlt = typeAttr === "image" ? control.getAttribute("alt") : null;
      if (imgAlt && imgAlt.trim()) {
        continue;
      }
      if (typeAttr === "submit" || typeAttr === "reset") {
        continue; // browsers supply a default name ("Submit", "Reset")
      }
    }
    const title = control.getAttribute("title");
    if (title && title.trim()) {
      continue;
    }

    let hint: string | null = null;
    const placeholder = control.getAttribute("placeholder");
    if (placeholder && placeholder.trim()) {
      hint =
        "placeholder present — placeholders are not reliable accessible names";
    } else if (labelledBy && !labelledByResolves) {
      hint = `aria-labelledby="${labelledBy}" does not resolve to any text`;
    } else if (isButtonLike) {
      hint = "button renders no text (icon-only?) — add an aria-label";
    }
    nameIssues.push({
      selector: uniqueSelectorOf(control),
      tag,
      typeAttr,
      hint,
    });
  }

  return {
    imageIssues,
    headingIssues,
    nameIssues,
    hasH1: document.querySelector("h1") !== null,
    imagesChecked: images.length,
    headingsChecked: headings.length,
    controlsChecked,
    truncated,
  };
}
