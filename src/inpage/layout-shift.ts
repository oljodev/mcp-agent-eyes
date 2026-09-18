/**
 * In-page payloads for Cumulative Layout Shift (CLS) measurement.
 *
 * `installLayoutShiftObserver` is registered via page.addInitScript so it runs
 * BEFORE any content parses, arming a PerformanceObserver that buffers every
 * unexpected `layout-shift` entry (and the DOM nodes that moved) onto a window
 * global. `drainLayoutShiftInPage` reads that buffer after the settle window
 * and resolves each moved node to a unique selector. Both are self-contained
 * (no outer-scope captures) so they serialize cleanly into the page.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Init-script: arm the layout-shift observer at the earliest possible moment. */
export function installLayoutShiftObserver(): void {
  const w = window as any;
  // Fresh buffer for this document load (one observer per page — the op
  // recreates the context so init scripts never stack). `armed` flips true
  // ONLY after observe() succeeds, so a browser without the Layout
  // Instability API (or a blocked observer) is honestly reported as
  // hadData:false rather than a misleading passing CLS of 0.
  const data: {
    value: number;
    shifts: Array<{ value: number; nodes: any[] }>;
    armed: boolean;
  } = { value: 0, shifts: [], armed: false };
  w.__agentEyesCLS = data;
  try {
    const po = new PerformanceObserver((list: any) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        data.value += entry.value;
        const nodes: any[] = [];
        for (const src of entry.sources || []) {
          if (src.node && src.node.nodeType === 1) nodes.push(src.node);
        }
        data.shifts.push({ value: entry.value, nodes });
      }
    });
    po.observe({ type: "layout-shift", buffered: true } as any);
    data.armed = true;
  } catch {
    // layout-shift unsupported — drain reports hadData:false (armed stayed false).
  }
}

/** Drain payload: aggregate the buffered shifts and resolve moved nodes. */
export function drainLayoutShiftInPage(): {
  cls: number;
  shiftCount: number;
  offenders: Array<{ selector: string; label: string; value: number }>;
  hadData: boolean;
} {
  const w = window as any;
  const data = w.__agentEyesCLS as
    | { value: number; shifts: Array<{ value: number; nodes: Element[] }>; armed: boolean }
    | undefined;
  if (!data || !data.armed) {
    return { cls: 0, shiftCount: 0, offenders: [], hadData: false };
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
    if (el.id) return el.id.slice(0, 30);
    const heading = el.querySelector("h1,h2,h3,h4,h5,h6");
    const headingText = heading?.textContent?.trim().replace(/\s+/g, " ");
    if (headingText) return headingText.slice(0, 30);
    return (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  }

  // Attribute each shift's score to every node that moved in it.
  const byElement = new Map<Element, number>();
  for (const shift of data.shifts) {
    for (const node of shift.nodes) {
      if (!node || !node.isConnected) continue;
      byElement.set(node, (byElement.get(node) ?? 0) + shift.value);
    }
  }
  const offenders = [...byElement.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([el, value]) => ({
      selector: uniqueSelectorOf(el),
      label: labelFor(el),
      value: Math.round(value * 10000) / 10000,
    }));

  return {
    cls: Math.round(data.value * 10000) / 10000,
    shiftCount: data.shifts.length,
    offenders,
    hadData: true,
  };
}
