/** extract_site_design: crawl a site and emit one merged design brief. */

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BrowserSession } from "../browser/session.js";
import { BrowserToolError, messageOf } from "../browser/errors.js";
import { navigateIfNeeded } from "../browser/navigation.js";
import { collectLinksInPage } from "../inpage/collect-links.js";
import { extractStyleInPage } from "../inpage/extract-style.js";
import {
  MAX_DESIGN_ELEMENTS,
  STYLES_DIR,
  type PageIA,
  type SiteDesign,
  type StyleTokens,
} from "../types/design.js";
import type { PageHealth } from "../types/health.js";
import { sanitizeBaselineName } from "./baseline.js";

/** Merge per-page token sets: arrays ranked by cross-page frequency, scalars by mode. */
function mergeTokens(list: StyleTokens[]): StyleTokens {
  const base = list[0];
  if (!base) {
    return {
      background: [],
      text: [],
      accent: null,
      accentGradient: null,
      fontPrimary: null,
      fontMono: null,
      typeScale: [],
      bodySize: null,
      weights: [],
      spacingBase: 4,
      spacingScale: [],
      radii: [],
      shadows: [],
    };
  }
  if (list.length === 1) return base;

  const freq = (pick: (t: StyleTokens) => string[]): string[] => {
    const count = new Map<string, number>();
    const firstAt = new Map<string, number>();
    list.forEach((t, pi) => {
      pick(t).forEach((v, i) => {
        count.set(v, (count.get(v) ?? 0) + 1);
        if (!firstAt.has(v)) firstAt.set(v, pi * 100 + i);
      });
    });
    return [...count.keys()].sort(
      (a, b) =>
        (count.get(b)! - count.get(a)!) || (firstAt.get(a)! - firstAt.get(b)!),
    );
  };
  const mode = (pick: (t: StyleTokens) => string | null | undefined): string | null => {
    const count = new Map<string, number>();
    for (const t of list) {
      const v = pick(t);
      if (v) count.set(v, (count.get(v) ?? 0) + 1);
    }
    let best: string | null = null;
    let bc = 0;
    for (const [k, c] of count) if (c > bc) { bc = c; best = k; }
    return best;
  };
  const numMode = (pick: (t: StyleTokens) => number | null | undefined): number | null => {
    const count = new Map<number, number>();
    for (const t of list) {
      const v = pick(t);
      if (v != null) count.set(v, (count.get(v) ?? 0) + 1);
    }
    let best: number | null = null;
    let bc = 0;
    for (const [k, c] of count) if (c > bc) { bc = c; best = k; }
    return best;
  };
  const numUnion = (pick: (t: StyleTokens) => number[]): number[] => {
    const s = new Set<number>();
    for (const t of list) for (const n of pick(t)) s.add(n);
    return [...s].sort((a, b) => a - b);
  };

  const merged: StyleTokens = {
    background: freq((t) => t.background).slice(0, 4),
    text: freq((t) => t.text).slice(0, 5),
    border: mode((t) => t.border ?? null),
    accent: mode((t) => t.accent),
    accentGradient: base.accentGradient,
    fontPrimary: mode((t) => t.fontPrimary),
    fontDisplay: mode((t) => t.fontDisplay ?? null),
    fontMono: mode((t) => t.fontMono),
    webfontLinks: freq((t) => t.webfontLinks ?? []).slice(0, 6),
    loadedFonts: freq((t) => t.loadedFonts ?? []).slice(0, 12),
    typeRamp: base.typeRamp,
    typeScale: numUnion((t) => t.typeScale),
    bodySize: numMode((t) => t.bodySize),
    weights: numUnion((t) => t.weights),
    spacingBase: numMode((t) => t.spacingBase) ?? 4,
    spacingScale: numUnion((t) => t.spacingScale).slice(0, 12),
    radii: numUnion((t) => t.radii),
    shadows: freq((t) => t.shadows).slice(0, 3),
    media: base.media,
    sections: base.sections,
  };
  return merged;
}

/**
 * Crawl up to maxPages same-origin pages (nav links first), extract the design
 * system + section IA from each, and merge into one brief. Design + structure
 * only — never content or assets. All serialized in one runExclusive slot.
 */
export function extractSiteDesign(
  session: BrowserSession,
  url: string,
  maxPages: number,
  saveAs: string | undefined,
): Promise<{ site: SiteDesign; savedPath: string | null; health: PageHealth }> {
  return session.core.runExclusive(async () => {
    const page = await session.core.ensurePage(
      session.core.currentViewport ?? "desktop",
    );
    await navigateIfNeeded(session.core, page, url, {});
    const origin = new URL(page.url()).origin;
    const rootPath = new URL(page.url()).pathname.replace(/\/+$/, "") || "/";

    let links: string[] = [];
    try {
      links = await page.evaluate(collectLinksInPage);
    } catch {
      // link collection failed — fall back to root-only.
    }
    const cap = Math.min(Math.max(1, maxPages), 12);
    const targets = [rootPath, ...links.filter((p) => p !== rootPath)].slice(0, cap);

    const tokensList: StyleTokens[] = [];
    const pages: PageIA[] = [];
    const crawled: string[] = [];
    const skipped: string[] = [];

    for (const p of targets) {
      try {
        await navigateIfNeeded(session.core, page, origin + p, {});
        const t = await page.evaluate(extractStyleInPage, {
          maxElements: MAX_DESIGN_ELEMENTS,
        });
        const title = (await page.title().catch(() => "")).trim();
        const ia: PageIA = { path: p, sections: t.sections ?? [] };
        if (title) ia.title = title.slice(0, 80);
        tokensList.push(t);
        pages.push(ia);
        crawled.push(p);
      } catch {
        skipped.push(p);
      }
    }

    if (tokensList.length === 0) {
      throw new BrowserToolError(
        `Could not extract design from any page under ${origin}.`,
      );
    }

    const site: SiteDesign = {
      origin,
      pagesCrawled: crawled,
      pagesSkipped: skipped,
      tokens: mergeTokens(tokensList),
      pages,
    };

    let savedPath: string | null = null;
    if (saveAs) {
      try {
        const dir = path.resolve(process.cwd(), STYLES_DIR);
        await mkdir(dir, { recursive: true });
        await session.store.ensureGitignore();
        const file = path.join(dir, `${sanitizeBaselineName(saveAs)}.json`);
        const tmp = `${file}.tmp-${process.pid}`;
        await writeFile(tmp, JSON.stringify(site, null, 2));
        await rename(tmp, file);
        savedPath = file;
      } catch (error) {
        throw new BrowserToolError(
          `Crawl succeeded but saving failed: ${messageOf(error)}`,
        );
      }
    }

    return { site, savedPath, health: await session.core.drainHealth() };
  });
}
