/**
 * Chromium-as-codec image encoder. A hidden "encoder" page (its own context,
 * permanently on about:blank) reuses Chromium's image codecs to re-encode raw
 * PNG screenshots as WebP/JPEG and downscale them — no native Node image
 * dependency needed. Any encoder failure falls back to the original PNG.
 */

import type { Browser, BrowserContext, Page } from "playwright-core";

import {
  THUMB_MAX_WIDTH,
  THUMB_QUALITY,
  type EncodedImage,
  type RenderOptions,
  type SizeMode,
} from "../types/images.js";
import { BrowserToolError, messageOf } from "./errors.js";
import { pngDimensions } from "./image-utils.js";

/** How the encoder obtains a browser to open its INVISIBLE helper page in. */
export interface EncoderBrowserSource {
  /**
   * The user-facing browser when it's safe to encode in (a launched headless
   * browser — already invisible and cheap), or null when it isn't (an attached
   * real Chrome / a visible headed window, where an encoder page would pop a
   * blank window/tab the human sees).
   */
  reusable: () => Browser | null;
  /** Launch a PRIVATE, invisible browser for encoding when reuse isn't safe. */
  launchPrivate: () => Promise<Browser>;
}

export class Encoder {
  private encoderContext: BrowserContext | null = null;
  private encoderPage: Page | null = null;
  /** A private, invisible browser launched only when reuse isn't safe. */
  private privateBrowser: Browser | null = null;

  constructor(private readonly source: EncoderBrowserSource) {}

  /** Drop the encoder context/page (e.g. when the browser is disposed). */
  reset(): void {
    this.encoderContext = null;
    this.encoderPage = null;
  }

  /** reset() + close the private encoder browser, if one was launched. */
  async dispose(): Promise<void> {
    this.reset();
    const priv = this.privateBrowser;
    this.privateBrowser = null;
    if (priv) {
      await priv.close().catch(() => undefined);
    }
  }

  /** Resolve a browser to encode in — reuse the main one, else a private one. */
  private async resolveBrowser(): Promise<Browser> {
    const reusable = this.source.reusable();
    if (reusable?.isConnected()) {
      return reusable;
    }
    if (this.privateBrowser?.isConnected()) {
      return this.privateBrowser;
    }
    this.privateBrowser = await this.source.launchPrivate();
    return this.privateBrowser;
  }

  /**
   * The wire variant of a capture: a small webp thumbnail in "thumb" mode, a
   * maxWidth-downscaled encode when requested, or the disk image as-is.
   */
  async chatVariant(
    rawPng: Buffer,
    diskImage: EncodedImage,
    render: RenderOptions,
    sizeMode: SizeMode,
  ): Promise<EncodedImage> {
    if (sizeMode === "thumb") {
      return this.encode(rawPng, {
        format: "webp",
        quality: THUMB_QUALITY,
        maxWidth: THUMB_MAX_WIDTH,
      });
    }
    if (render.maxWidth !== undefined) {
      return this.encode(rawPng, render);
    }
    return diskImage;
  }

  /**
   * Encode a PNG screenshot into the requested format, downscaling to
   * maxWidth if asked. Lossless PNG with no resize is passed through
   * untouched; everything else round-trips through Chromium's canvas codecs
   * on the hidden encoder page. Any encoder failure falls back to the
   * original PNG — a more expensive image beats a failed tool call.
   */
  async encode(png: Buffer, render: RenderOptions): Promise<EncodedImage> {
    if (render.format === "png" && render.maxWidth === undefined) {
      const dims = pngDimensions(png);
      return {
        data: png.toString("base64"),
        mimeType: "image/png",
        width: dims.width,
        height: dims.height,
        bytes: png.length,
      };
    }

    try {
      return await this.encodeViaChromium(png, render);
    } catch (error) {
      console.error(
        `agent-eyes: ${render.format} encode failed (${messageOf(error)}); returning png`,
      );
      const dims = pngDimensions(png);
      return {
        data: png.toString("base64"),
        mimeType: "image/png",
        width: dims.width,
        height: dims.height,
        bytes: png.length,
      };
    }
  }

  private async encodeViaChromium(
    png: Buffer,
    render: RenderOptions,
  ): Promise<EncodedImage> {
    const page = await this.ensureEncoderPage();
    const result = await page.evaluate(
      async ({ b64, mime, quality, maxWidth }) => {
        const blob = await (
          await fetch(`data:image/png;base64,${b64}`)
        ).blob();
        const bitmap = await createImageBitmap(blob);
        const scale =
          maxWidth !== null && bitmap.width > maxWidth
            ? maxWidth / bitmap.width
            : 1;
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("2d canvas context unavailable");
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        const out = await canvas.convertToBlob({ type: mime, quality });
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(reader.error ?? new Error("read failed"));
          reader.readAsDataURL(out);
        });
        return {
          b64: dataUrl.slice(dataUrl.indexOf(",") + 1),
          type: out.type,
          width,
          height,
        };
      },
      {
        b64: png.toString("base64"),
        mime: `image/${render.format}`,
        quality: Math.min(100, Math.max(1, render.quality)) / 100,
        maxWidth: render.maxWidth ?? null,
      },
    );

    // Canvas silently falls back to png when a codec is unavailable —
    // report whatever was actually produced.
    const mimeType =
      result.type === "image/webp" || result.type === "image/jpeg"
        ? result.type
        : "image/png";
    return {
      data: result.b64,
      mimeType,
      width: result.width,
      height: result.height,
      bytes: Buffer.from(result.b64, "base64").length,
    };
  }

  private async ensureEncoderPage(): Promise<Page> {
    const browser = await this.resolveBrowser();
    if (!browser.isConnected()) {
      throw new BrowserToolError("The browser is not running.");
    }
    if (this.encoderPage && !this.encoderPage.isClosed()) {
      return this.encoderPage;
    }
    if (!this.encoderContext) {
      this.encoderContext = await browser.newContext({
        viewport: { width: 64, height: 64 },
      });
    }
    this.encoderPage = await this.encoderContext.newPage();
    return this.encoderPage;
  }
}
