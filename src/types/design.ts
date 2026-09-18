/**
 * Design review (the "taste engine") and the style-token extractor: the
 * measured-system thresholds, the buildable token spec, and flagged smells.
 */

/** Cap on elements walked by review_design, to bound cost on huge pages. */
export const MAX_DESIGN_ELEMENTS = 4000;

/**
 * The "house standard" thresholds review_design measures against. Defaults are
 * tuned to what designed (vs template-y / generated) UIs look like; a future
 * project config can override these.
 */
export const DESIGN_LIMITS = {
  /** Distinct font sizes before it reads as an undisciplined type scale. */
  fontSizes: 6,
  /** Distinct text colors before the palette looks muddy. */
  textColors: 6,
  /** Distinct background colors. */
  bgColors: 8,
  /** Distinct primary font families. */
  fontFamilies: 2,
  /** Distinct non-zero border-radii (a consistent radius language is ~1-2). */
  radii: 4,
  /** Spacing grid: values not divisible by this are "off-grid". */
  spacingGrid: 4,
  /** Minimum comfortable body line-height ratio. */
  minBodyLineHeight: 1.4,
  /** Minimum comfortable body font size (px). */
  minBodyFontPx: 16,
  /** Maximum comfortable line length (approx chars). */
  maxLineLengthCh: 90,
  /** Near-miss alignment band (px): edges this far apart read as "almost aligned". */
  alignNearMissMin: 1,
  alignNearMissMax: 6,
} as const;

/** Directory (relative to cwd) where extracted style-token sets are saved. */
export const STYLES_DIR = ".agent-eyes/styles";

/** One rung of the type ramp (a heading level or body), with its key metrics. */
export interface TypeRampEntry {
  /** "display" | "h1" | "h2" | "h3" | "body". */
  role: string;
  px: number;
  weight: number;
  /** line-height as a ratio of font-size (e.g. 1.5). */
  lineHeight: number;
  /** letter-spacing as the computed string (e.g. "normal", "-0.5px"). */
  letterSpacing: string;
  /** text-transform (e.g. "none", "uppercase"). */
  transform: string;
}

/**
 * How an image SLOT is treated (NOT the asset itself — no src is captured).
 * Lets a rebuild drop a correctly-shaped placeholder.
 */
export interface MediaTreatment {
  /** logo | hero | photo | icon | avatar | image. */
  role: string;
  /** width / height, rounded to 2dp. */
  aspectRatio: number;
  width: number;
  height: number;
  /** border-radius in px (9999 = pill/circle). */
  radius: number;
}

/** One top-level page band, classified — the page's information architecture. */
export interface SectionInfo {
  /** nav | hero | logo-bar | feature-grid | pricing | faq | cta-band | blog-grid | testimonial | footer | generic. */
  type: string;
  /** Estimated columns in the band's repeated group (1 = stacked). */
  columns: number;
  /** Count of repeated items (cards/tiers/logos), 0 if not a repeating band. */
  itemCount: number;
  /** Short functional heading label (≤60 chars) — a structural hint, not body copy. */
  heading?: string | undefined;
  /** Short CTA label (≤30 chars) if the band has a primary button. */
  cta?: string | undefined;
}

/**
 * A buildable design-token spec extracted from a reference URL — the output of
 * extract_design_tokens ("steal this style"). Colors are rgb() strings
 * (oklch/hsl are normalized to rgb at extraction); formatting to hex / CSS
 * variables happens at the presentation layer.
 *
 * Captures the DESIGN SYSTEM + STRUCTURE only — never body copy or assets.
 */
export interface StyleTokens {
  /** Background colors ranked by painted area (page background first). */
  background: string[];
  /** Text colors ranked by usage (body text first). */
  text: string[];
  /** Most common border color, if any. */
  border?: string | null;
  /** Inferred brand/accent color (most saturated on interactive elements). */
  accent: string | null;
  /** Accent gradient, if buttons/links use one (a premium signal). */
  accentGradient: string | null;
  /** Most-used BODY font family (kept as fontPrimary for back-compat). */
  fontPrimary: string | null;
  /** Distinct DISPLAY/heading font family, when it differs from body (the serif tell). */
  fontDisplay?: string | null;
  fontMono: string | null;
  /** Webfont stylesheet hrefs (e.g. the Google Fonts URL) so the exact fonts load. */
  webfontLinks?: string[];
  /** Font families actually loaded on the page (document.fonts). */
  loadedFonts?: string[];
  /** Per-role type ramp (display/h1/h2/h3/body) with weight + line-height. */
  typeRamp?: TypeRampEntry[];
  /** Distinct font sizes (px), ascending. */
  typeScale: number[];
  /** Inferred body text size (px). */
  bodySize: number | null;
  weights: number[];
  /** Inferred spacing base unit (4 or 8). */
  spacingBase: number;
  spacingScale: number[];
  radii: number[];
  /** Distinct box-shadows, ranked by usage (the elevation style). */
  shadows: string[];
  /** Image-slot treatments (role/aspect/radius) — no asset src. */
  media?: MediaTreatment[];
  /** Top-level section anatomy (the page's information architecture). */
  sections?: SectionInfo[];
}

/** One crawled page's information architecture (its ordered section anatomy). */
export interface PageIA {
  /** Same-origin pathname, e.g. "/pricing". */
  path: string;
  /** The page's <title> (short factual metadata), if any. */
  title?: string | undefined;
  sections: SectionInfo[];
}

/**
 * A whole-site design brief from extract_site_design: tokens merged across the
 * crawled pages (ranked by cross-page frequency = the real system) plus the
 * per-page information architecture. Design + structure only — no content.
 */
export interface SiteDesign {
  origin: string;
  pagesCrawled: string[];
  pagesSkipped: string[];
  /** Design tokens merged across all crawled pages. */
  tokens: StyleTokens;
  /** Per-page section outlines (the sitemap + IA). */
  pages: PageIA[];
}

/** One flagged design issue ("smell") with an addressable selector. */
export interface DesignSmell {
  /** Category, e.g. "TYPE SCALE", "COLOR", "SPACING", "READABILITY", "ALIGNMENT". */
  kind: string;
  detail: string;
  selector?: string | undefined;
}

/** The measured design system + flagged smells from review_design. */
export interface DesignReview {
  elementsScanned: number;
  truncated: boolean;
  textColors: Array<{ value: string; count: number }>;
  bgColors: string[];
  fontSizes: number[];
  fontWeights: number[];
  fontFamilies: string[];
  lineHeights: number[];
  radii: number[];
  shadowCount: number;
  spacing: number[];
  offGridSpacing: number[];
  smells: DesignSmell[];
}
