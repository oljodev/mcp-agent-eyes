import type {
  MediaTreatment,
  SectionInfo,
  StyleTokens,
  TypeRampEntry,
} from "../types/design.js";

/**
 * In-page (browser context) style extractor for "steal this style". Walks
 * visible elements and infers a buildable design system + structure:
 * background/text/border colors, an accent, fonts BY ROLE (display vs body vs
 * mono) + the loaded webfonts, a per-role type ramp, spacing/radii/shadows,
 * image-slot treatments, and the page's section anatomy.
 *
 * Captures DESIGN + STRUCTURE only — short functional labels at most, never
 * body copy, and never an asset src. Everything is inline (page.evaluate
 * serializes only this function's own source).
 */
export function extractStyleInPage(limits: { maxElements: number }): StyleTokens {
  const empty: StyleTokens = {
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
  if (!document.body) return empty;

  // --- color parsing: rgb/rgba + oklch → {r,g,b,a}; canon() → "rgb(r, g, b)" ---
  const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const lin2srgb = (x: number) =>
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  const oklchToRgb = (
    L: number,
    C: number,
    H: number,
  ): { r: number; g: number; b: number } => {
    const hr = (H * Math.PI) / 180;
    const a = C * Math.cos(hr);
    const b = C * Math.sin(hr);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    return {
      r: clamp255(
        lin2srgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255,
      ),
      g: clamp255(
        lin2srgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255,
      ),
      b: clamp255(
        lin2srgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255,
      ),
    };
  };
  const parseColor = (
    s: string,
  ): { r: number; g: number; b: number; a: number } | null => {
    if (!s) return null;
    const rgb = s.match(/rgba?\(([^)]+)\)/);
    if (rgb && rgb[1]) {
      const p = rgb[1]
        .split(/[,\s/]+/)
        .map((x) => parseFloat(x))
        .filter((x) => !Number.isNaN(x));
      if (p.length >= 3) return { r: p[0]!, g: p[1]!, b: p[2]!, a: p[3] ?? 1 };
    }
    const ok = s.match(/oklch\(([^)]+)\)/);
    if (ok && ok[1]) {
      const parts = ok[1].split(/[\s/]+/).filter(Boolean);
      const L0 = parts[0]
        ? parts[0].endsWith("%")
          ? parseFloat(parts[0]) / 100
          : parseFloat(parts[0])
        : 0;
      const C = parts[1] ? parseFloat(parts[1]) : 0;
      const H = parts[2] ? parseFloat(parts[2]) : 0;
      const a = parts[3]
        ? parts[3].endsWith("%")
          ? parseFloat(parts[3]) / 100
          : parseFloat(parts[3])
        : 1;
      const { r, g, b } = oklchToRgb(L0 > 1 ? L0 / 100 : L0, C, H);
      return { r, g, b, a };
    }
    return null;
  };
  const canon = (s: string): string | null => {
    const c = parseColor(s);
    if (!c || c.a <= 0) return null;
    return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  };
  const chroma = (c: { r: number; g: number; b: number }) =>
    Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  const fam1 = (f: string) => (f.split(",")[0] ?? "").replace(/["']/g, "").trim();
  const hasDirectText = (el: Element): boolean => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3 && (n.textContent ?? "").trim().length > 0) return true;
    }
    return false;
  };

  type Sample = {
    weight: number;
    lineHeight: number;
    letterSpacing: string;
    transform: string;
  };

  const bgArea = new Map<string, number>();
  const textUse = new Map<string, number>();
  const borderUse = new Map<string, number>();
  const sizes = new Map<number, number>();
  const weights = new Set<number>();
  const headingFam = new Map<string, number>();
  const bodyFam = new Map<string, number>();
  let monoFamily: string | null = null;
  const headingSamples = new Map<number, Sample>();
  const bodySamples = new Map<number, Sample>();
  const spacing = new Set<number>();
  const radii = new Set<number>();
  const shadowUse = new Map<string, number>();
  const accentCandidates: Array<{ color: string; chroma: number }> = [];
  let accentGradient: string | null = null;
  const media: MediaTreatment[] = [];

  const SKIP = new Set([
    "script",
    "style",
    "noscript",
    "path",
    "br",
    "head",
    "meta",
    "link",
  ]);
  const all = Array.from(document.body.querySelectorAll("*"));
  const elements =
    all.length > limits.maxElements ? all.slice(0, limits.maxElements) : all;

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      parseFloat(cs.opacity) === 0
    ) {
      continue;
    }
    const interactive =
      tag === "a" || tag === "button" || el.getAttribute("role") === "button";

    const bgKey = canon(cs.backgroundColor);
    if (bgKey) {
      bgArea.set(bgKey, (bgArea.get(bgKey) ?? 0) + rect.width * rect.height);
      const bp = parseColor(cs.backgroundColor);
      if (interactive && bp && chroma(bp) > 40) {
        accentCandidates.push({ color: bgKey, chroma: chroma(bp) });
      }
    }
    const bw = parseFloat(cs.borderTopWidth);
    if (!Number.isNaN(bw) && bw > 0) {
      const bc = canon(cs.borderTopColor);
      if (bc) borderUse.set(bc, (borderUse.get(bc) ?? 0) + 1);
    }
    const bgImg = cs.backgroundImage;
    if (interactive && bgImg && bgImg.includes("gradient(") && !accentGradient) {
      accentGradient =
        bgImg.length > 120 ? `${bgImg.slice(0, 117)}...` : bgImg;
    }

    const radius = parseFloat(cs.borderTopLeftRadius);
    if (!Number.isNaN(radius) && radius > 0) radii.add(Math.round(radius));
    if (cs.boxShadow && cs.boxShadow !== "none") {
      shadowUse.set(cs.boxShadow, (shadowUse.get(cs.boxShadow) ?? 0) + 1);
    }
    for (const v of [
      cs.paddingTop,
      cs.paddingRight,
      cs.paddingBottom,
      cs.paddingLeft,
      cs.marginTop,
      cs.marginBottom,
    ]) {
      const px = parseFloat(v);
      if (!Number.isNaN(px) && px > 0) spacing.add(Math.round(px));
    }

    // image-slot treatments (no src captured)
    if (
      tag === "img" ||
      tag === "svg" ||
      tag === "picture" ||
      (bgImg && bgImg.includes("url("))
    ) {
      if (rect.width >= 16 && rect.height >= 16 && media.length < 10) {
        const r = Math.round(radius);
        const minSide = Math.min(rect.width, rect.height);
        let role = "image";
        if (rect.width < 48 && rect.height < 48) role = "icon";
        else if (r >= minSide / 2 - 2 && minSide < 120) role = "avatar";
        else if (rect.width >= 600 && rect.top < 900) role = "hero";
        else if (rect.top < 120 || el.closest("header") !== null) role = "logo";
        else role = "photo";
        media.push({
          role,
          aspectRatio: Math.round((rect.width / rect.height) * 100) / 100,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          radius: r,
        });
      }
    }

    if (hasDirectText(el)) {
      const txt = (el.textContent ?? "").trim();
      const tkey = canon(cs.color);
      if (tkey) textUse.set(tkey, (textUse.get(tkey) ?? 0) + Math.max(1, txt.length));
      const fsPx = parseFloat(cs.fontSize);
      const fw = parseInt(cs.fontWeight, 10) || 400;
      if (!Number.isNaN(fsPx)) {
        sizes.set(Math.round(fsPx), (sizes.get(Math.round(fsPx)) ?? 0) + 1);
      }
      weights.add(fw);

      const famRaw = cs.fontFamily;
      const fam = fam1(famRaw);
      const isMono = /mono|consol|courier|menlo/i.test(famRaw);
      if (isMono && !monoFamily) monoFamily = fam || null;
      const isHeading = /^h[1-6]$/.test(tag) || (fsPx >= 24 && fw >= 600);
      if (fam && !isMono) {
        if (isHeading) headingFam.set(fam, (headingFam.get(fam) ?? 0) + 1);
        else bodyFam.set(fam, (bodyFam.get(fam) ?? 0) + Math.max(1, txt.length));
      }

      const lh = parseFloat(cs.lineHeight);
      const ratio =
        !Number.isNaN(lh) && fsPx > 0 ? Math.round((lh / fsPx) * 100) / 100 : 1.5;
      const sample: Sample = {
        weight: fw,
        lineHeight: ratio,
        letterSpacing: cs.letterSpacing,
        transform: cs.textTransform,
      };
      if (!Number.isNaN(fsPx)) {
        const k = Math.round(fsPx);
        if (isHeading) {
          if (!headingSamples.has(k)) headingSamples.set(k, sample);
        } else if (!bodySamples.has(k)) {
          bodySamples.set(k, sample);
        }
      }

      const tc = parseColor(cs.color);
      if (interactive && tc && chroma(tc) > 40 && tkey) {
        accentCandidates.push({ color: tkey, chroma: chroma(tc) });
      }
    }
  }

  const byDesc = <T>(m: Map<T, number>): T[] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  const typeScale = [...sizes.keys()].sort((a, b) => a - b);
  let bodySize: number | null = null;
  let bodyUse = -1;
  for (const [sz, use] of sizes) {
    if (sz >= 12 && sz <= 20 && use > bodyUse) {
      bodyUse = use;
      bodySize = sz;
    }
  }
  if (bodySize === null && typeScale.length) bodySize = typeScale[0] ?? null;

  // type ramp: largest heading sizes (display/h1/h2/h3) + body
  const roleNames = ["display", "h1", "h2", "h3"];
  const ramp: TypeRampEntry[] = [];
  [...headingSamples.keys()]
    .sort((a, b) => b - a)
    .slice(0, 4)
    .forEach((px, i) => {
      const s = headingSamples.get(px)!;
      ramp.push({
        role: roleNames[i] ?? `h${i + 1}`,
        px,
        weight: s.weight,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        transform: s.transform,
      });
    });
  if (bodySize !== null) {
    const bs = bodySamples.get(bodySize);
    ramp.push({
      role: "body",
      px: bodySize,
      weight: bs?.weight ?? 400,
      lineHeight: bs?.lineHeight ?? 1.5,
      letterSpacing: bs?.letterSpacing ?? "normal",
      transform: bs?.transform ?? "none",
    });
  }

  const fontBody = byDesc(bodyFam)[0] ?? byDesc(headingFam)[0] ?? null;
  const fontDisplayRaw = byDesc(headingFam)[0] ?? null;
  const fontDisplay =
    fontDisplayRaw && fontDisplayRaw !== fontBody ? fontDisplayRaw : null;

  const spacingArr = [...spacing];
  const on8 = spacingArr.length > 0 && spacingArr.every((v) => v % 8 === 0);

  let accent: string | null = null;
  let bestChroma = -1;
  for (const c of accentCandidates) {
    if (c.chroma > bestChroma) {
      bestChroma = c.chroma;
      accent = c.color;
    }
  }
  if (!accent && accentGradient) {
    const stop = parseColor(accentGradient);
    if (stop) {
      accent = `rgb(${Math.round(stop.r)}, ${Math.round(stop.g)}, ${Math.round(stop.b)})`;
    }
  }

  // webfonts
  const webfontLinks = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], link[as="font"]'),
  )
    .map((l) => (l as HTMLLinkElement).href)
    .filter((h) => /font/i.test(h));
  const dedupLinks = [...new Set(webfontLinks)].slice(0, 6);
  const loadedFonts: string[] = [];
  try {
    document.fonts.forEach((f) => {
      const fam = f.family.replace(/["']/g, "");
      if (fam && !loadedFonts.includes(fam) && loadedFonts.length < 12) {
        loadedFonts.push(fam);
      }
    });
  } catch {
    // FontFaceSet not iterable in this engine — skip.
  }

  // --- section anatomy ---
  const btnText = (el: Element): string | undefined => {
    const b = el.querySelector("button, a[class*='btn'], a[class*='button']");
    let t = b ? (b.textContent ?? "").trim() : "";
    if (!t) {
      const cand = Array.from(el.querySelectorAll("a")).find((a) => {
        const tx = (a.textContent ?? "").trim();
        return tx.length > 0 && tx.length <= 24;
      });
      t = cand ? (cand.textContent ?? "").trim() : "";
    }
    return t ? t.replace(/\s+/g, " ").slice(0, 30) : undefined;
  };
  const repeatedGroup = (
    band: Element,
  ): { count: number; columns: number; hasImg: boolean; hasHeading: boolean } => {
    let best = { count: 0, columns: 1, hasImg: false, hasHeading: false };
    const descendants = Array.from(band.querySelectorAll("*")).slice(0, 1500);
    for (const cont of descendants) {
      const kids = Array.from(cont.children);
      if (kids.length < 3) continue;
      const firstTag = kids[0]!.tagName;
      const same = kids.filter((k) => k.tagName === firstTag);
      if (same.length < 3 || same.length <= best.count) continue;
      const top0 = Math.round(same[0]!.getBoundingClientRect().top);
      const cols = same.filter(
        (k) => Math.abs(Math.round(k.getBoundingClientRect().top) - top0) <= 6,
      ).length;
      best = {
        count: same.length,
        columns: Math.max(1, cols),
        hasImg: same.slice(0, 2).some((k) => k.querySelector("img, svg") !== null),
        hasHeading: same
          .slice(0, 2)
          .some((k) => k.querySelector("h1,h2,h3,h4") !== null),
      };
    }
    return best;
  };
  const classify = (el: Element, kind: "header" | "footer" | "band"): SectionInfo => {
    if (kind === "header") {
      const out: SectionInfo = {
        type: "nav",
        columns: 1,
        itemCount: el.querySelectorAll("a").length,
      };
      const c = btnText(el);
      if (c) out.cta = c;
      return out;
    }
    if (kind === "footer") {
      return {
        type: "footer",
        columns: el.querySelectorAll("ul, nav").length || 1,
        itemCount: el.querySelectorAll("a").length,
      };
    }
    const txt = el.textContent ?? "";
    const hEl = el.querySelector("h1, h2, h3");
    const heading = hEl
      ? (hEl.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60)
      : undefined;
    const grp = repeatedGroup(el);
    const imgCount = el.querySelectorAll("img, svg").length;
    const cta = btnText(el);
    const priceLike =
      /(\$|€|£|kr|\bSEK\b|\bUSD\b|\bEUR\b)\s?\d|\d+\s?(\/mo|per\s)/i.test(txt);

    // An <h1> is the strongest single signal — heroes carry the page's one h1,
    // and grids/faqs/pricing bands sit below under h2s. Check it first so a
    // hero with icon-bullets isn't mistaken for a card grid.
    let type = "generic";
    if (el.querySelector("h1")) type = "hero";
    else if (el.querySelectorAll("[aria-expanded]").length >= 2) type = "faq";
    else if (priceLike && grp.count >= 2) type = "pricing";
    else if (grp.count >= 3 && grp.hasImg) type = "blog-grid";
    else if (grp.count >= 3 && grp.hasHeading) type = "feature-grid";
    else if (imgCount >= 4 && txt.trim().length < 160) type = "logo-bar";
    else if (heading && cta) type = "cta-band";

    const out: SectionInfo = { type, columns: grp.columns, itemCount: grp.count };
    if (heading) out.heading = heading;
    if (cta) out.cta = cta;
    return out;
  };

  const sections: SectionInfo[] = [];
  const header = document.querySelector("header");
  const footer = document.querySelector("footer");
  const main = document.querySelector("main");
  if (header) sections.push(classify(header, "header"));
  const bandParent = main ?? document.body;
  for (const child of Array.from(bandParent.children)) {
    if (sections.length >= 14) break;
    if (child === header || child === footer) continue;
    if (child.getBoundingClientRect().height < 40) continue;
    sections.push(classify(child, "band"));
  }
  if (footer) sections.push(classify(footer, "footer"));

  return {
    background: byDesc(bgArea).slice(0, 4),
    text: byDesc(textUse).slice(0, 5),
    border: byDesc(borderUse)[0] ?? null,
    accent,
    accentGradient,
    fontPrimary: fontBody,
    fontDisplay,
    fontMono: monoFamily,
    webfontLinks: dedupLinks,
    loadedFonts,
    typeRamp: ramp,
    typeScale,
    bodySize,
    weights: [...weights].sort((a, b) => a - b),
    spacingBase: on8 ? 8 : 4,
    spacingScale: spacingArr.sort((a, b) => a - b).slice(0, 12),
    radii: [...radii].sort((a, b) => a - b),
    shadows: byDesc(shadowUse).slice(0, 3),
    media,
    sections,
  };
}
