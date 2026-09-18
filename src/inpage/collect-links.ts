/**
 * In-page (browser context): collect same-origin link PATHS for a crawl,
 * nav/header first (the primary information architecture), then footer, then
 * anywhere. Returns ordered, deduped pathnames. Self-contained (serialized by
 * page.evaluate). Captures URLs/structure only — no content.
 */
export function collectLinksInPage(): string[] {
  const origin = location.origin;
  const seen = new Set<string>();
  const out: string[] = [];
  const skipExt = /\.(png|jpe?g|svg|webp|gif|avif|pdf|zip|css|js|ico|xml|json|mp4|woff2?)$/i;

  const add = (scope: ParentNode | null): void => {
    if (!scope) return;
    for (const a of Array.from(scope.querySelectorAll("a[href]"))) {
      const href = (a as HTMLAnchorElement).href;
      if (!href || !href.startsWith(origin)) continue;
      let u: URL;
      try {
        u = new URL(href);
      } catch {
        continue;
      }
      if (skipExt.test(u.pathname)) continue;
      const p = u.pathname.replace(/\/+$/, "") || "/";
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  };

  add(document.querySelector("header"));
  add(document.querySelector("nav"));
  add(document.querySelector("footer"));
  add(document.body);
  return out.slice(0, 40);
}
