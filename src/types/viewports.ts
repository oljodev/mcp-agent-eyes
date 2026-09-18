/**
 * Responsive breakpoints exposed to agents. A small, opinionated set so agents
 * reason about breakpoints by name instead of inventing pixel sizes.
 */

/** A browser viewport size in CSS pixels. */
export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * The responsive breakpoints exposed to agents — a small, opinionated set so
 * agents reason about breakpoints by name instead of inventing pixel sizes.
 */
export const VIEWPORTS = {
  /** Modern smartphone (iPhone 15/16-class device, portrait). */
  mobile: { width: 393, height: 852 },
  /** Tablet (iPad-class device, portrait). */
  tablet: { width: 768, height: 1024 },
  /** Laptop / small desktop display. */
  desktop: { width: 1440, height: 900 },
  /** Full HD desktop display. */
  ultrawide: { width: 1920, height: 1080 },
} as const satisfies Record<string, ViewportSize>;

export type ViewportName = keyof typeof VIEWPORTS;

/** Tuple of viewport names, smallest to largest (zod enum + matrix order). */
export const VIEWPORT_NAMES = [
  "mobile",
  "tablet",
  "desktop",
  "ultrawide",
] as const satisfies readonly ViewportName[];
