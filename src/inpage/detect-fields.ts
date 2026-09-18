import type { DetectedFields } from "../types/auth.js";

/**
 * Runs inside the page (must be self-contained — no outer-scope captures).
 * Best-guess locator of the username / password / submit / one-time-code
 * fields, used only as a fallback when the AI omits a selector (an AI-provided
 * selector always wins). Returns unique CSS selectors, or null per field when
 * nothing plausible is found. The cssEscape/uniqueSelectorOf helpers are
 * inlined verbatim (the house pattern for page.evaluate payloads); the
 * DetectedFields import is type-only and erased at compile.
 */
export function detectFieldsInPage(): DetectedFields {
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
  function isShown(el: Element): boolean {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function firstShown(root: ParentNode, selector: string): Element | null {
    for (const el of Array.from(root.querySelectorAll(selector))) {
      if (isShown(el)) return el;
    }
    return null;
  }

  const password = firstShown(document, 'input[type="password"]');
  const form: ParentNode = password?.closest("form") ?? document;

  let username = firstShown(form, 'input[autocomplete="username"]');
  if (!username) username = firstShown(form, 'input[type="email"]');
  if (!username) {
    for (const sel of [
      'input[name*="user" i]',
      'input[name*="email" i]',
      'input[name*="login" i]',
    ]) {
      username = firstShown(form, sel);
      if (username) break;
    }
  }
  if (!username && password && form !== document) {
    // The visible non-password text input nearest before the password field.
    const inputs = Array.from(form.querySelectorAll("input")).filter(isShown);
    const pwIndex = inputs.indexOf(password as HTMLInputElement);
    for (let i = pwIndex - 1; i >= 0; i--) {
      const candidate = inputs[i];
      if (!candidate) continue;
      const type = (candidate.getAttribute("type") ?? "text").toLowerCase();
      if (!["hidden", "password", "checkbox", "radio", "submit"].includes(type)) {
        username = candidate;
        break;
      }
    }
  }

  let submit = firstShown(form, 'button[type="submit"]');
  if (!submit) submit = firstShown(form, 'input[type="submit"]');
  if (!submit) {
    for (const btn of Array.from(form.querySelectorAll("button"))) {
      if (isShown(btn) && /log\s?in|sign\s?in|continue|next|submit/i.test(btn.textContent ?? "")) {
        submit = btn;
        break;
      }
    }
  }

  const otp = firstShown(
    document,
    'input[autocomplete="one-time-code"], input[name*="otp" i], ' +
      'input[name*="code" i], input[name*="token" i], input[id*="otp" i], ' +
      'input[aria-label*="code" i], input[inputmode="numeric"][maxlength]',
  );

  return {
    username: username ? uniqueSelectorOf(username) : null,
    password: password ? uniqueSelectorOf(password) : null,
    submit: submit ? uniqueSelectorOf(submit) : null,
    otp: otp ? uniqueSelectorOf(otp) : null,
  };
}
