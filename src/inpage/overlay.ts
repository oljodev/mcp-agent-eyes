/**
 * Runs inside the page (must be self-contained — no outer-scope captures).
 * Draws bold red outline boxes (in document coordinates, scroll-proof) over
 * every selector passed in, inside a single removable container appended to
 * the root element. Returns how many boxes were painted.
 */
export function paintIssueOverlay(selectors: string[]): number {
  document.getElementById("__agent_eyes_overlay__")?.remove();
  const container = document.createElement("div");
  container.id = "__agent_eyes_overlay__";
  container.style.cssText =
    "position:absolute;top:0;left:0;width:0;height:0;" +
    "pointer-events:none;z-index:2147483647;";
  let painted = 0;
  for (const sel of selectors) {
    let el: Element | null = null;
    try {
      el = document.querySelector(sel);
    } catch {
      continue; // selector failed to parse in this engine — skip it
    }
    if (!el) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      continue;
    }
    const box = document.createElement("div");
    box.style.cssText = [
      "position:absolute",
      `left:${rect.left + window.scrollX - 3}px`,
      `top:${rect.top + window.scrollY - 3}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      "border:3px solid #ff1f1f",
      "box-shadow:0 0 0 1px rgba(255,255,255,0.85)," +
        "inset 0 0 0 1px rgba(255,255,255,0.85)",
      "border-radius:2px",
    ].join(";");
    container.appendChild(box);
    painted++;
  }
  document.documentElement.appendChild(container);
  return painted;
}
