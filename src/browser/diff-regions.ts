/**
 * Connected-component clustering for visual regression. Given a per-pixel
 * "changed" mask, group adjacent changed pixels (8-connectivity) into
 * bounding-box regions so a raw pixel diff becomes a small set of anomaly
 * rectangles that can be hit-tested to elements. Pure, dependency-free.
 */

/** A clustered rectangle of changed pixels, in device-pixel coordinates. */
export interface RawDiffRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Number of changed pixels in the component. */
  pixels: number;
}

/**
 * Flood-fill the mask into connected components and return their bounding
 * boxes. The mask is consumed (visited pixels are zeroed) to avoid a second
 * visited buffer. Components below `minPixels` or `minSide` are dropped as
 * anti-alias / sub-pixel noise; the largest `maxRegions` survive.
 */
export function clusterDiffMask(
  mask: Uint8Array,
  width: number,
  height: number,
  opts: { minPixels?: number; minSide?: number; maxRegions?: number } = {},
): RawDiffRegion[] {
  const minPixels = opts.minPixels ?? 64;
  const minSide = opts.minSide ?? 6;
  const maxRegions = opts.maxRegions ?? 24;

  const regions: RawDiffRegion[] = [];
  // Explicit stack of pixel indices (avoids recursion blowups on big blobs).
  const stack = new Int32Array(width * height);

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0) continue;

    let sp = 0;
    stack[sp++] = start;
    mask[start] = 0;

    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    let pixels = 0;

    while (sp > 0) {
      const p = stack[sp - 1]!;
      sp--;
      const x = p % width;
      const y = (p - x) / width;
      pixels++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;

      // 8-connected neighbours.
      const xMin = x > 0 ? x - 1 : 0;
      const xMax = x < width - 1 ? x + 1 : width - 1;
      const yMin = y > 0 ? y - 1 : 0;
      const yMax = y < height - 1 ? y + 1 : height - 1;
      for (let ny = yMin; ny <= yMax; ny++) {
        for (let nx = xMin; nx <= xMax; nx++) {
          const np = ny * width + nx;
          if (mask[np] !== 0) {
            mask[np] = 0;
            stack[sp++] = np;
          }
        }
      }
    }

    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (pixels >= minPixels && (w >= minSide || h >= minSide)) {
      regions.push({ x0, y0, x1, y1, pixels });
    }
  }

  regions.sort((a, b) => b.pixels - a.pixels);
  return regions.slice(0, maxRegions);
}
