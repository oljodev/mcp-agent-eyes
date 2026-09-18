/** Small image utilities: device scale, PNG dimension reads, canvas padding. */

import { PNG } from "pngjs";

/** Device-pixel scale for screenshots; override with AGENT_EYES_SCALE=2. */
export function deviceScaleFactor(): number {
  const raw = Number(process.env["AGENT_EYES_SCALE"] ?? "1");
  return Number.isFinite(raw) && raw >= 1 && raw <= 3 ? raw : 1;
}

/** Read dimensions straight out of the PNG IHDR chunk. */
export function pngDimensions(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Blit an image onto a white w x h canvas (pixelmatch needs equal dims). */
export function padToCanvas(img: PNG, width: number, height: number): PNG {
  if (img.width === width && img.height === height) {
    return img;
  }
  const out = new PNG({ width, height });
  out.data.fill(255); // opaque white
  PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
  return out;
}
