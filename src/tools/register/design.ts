/** Registers review_design and extract_design_tokens. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { session } from "../../browser/session.js";
import {
  maxPagesField,
  maxSmellsField,
  optionalViewportField,
  reloadField,
  saveAsField,
  urlField,
} from "../../types/index.js";
import {
  type Assertion,
  assertionBlock,
  errorResult,
  finalize,
  metadataBlock,
  textBlock,
} from "../blocks.js";
import { healthBlock } from "../health-format.js";
import {
  formatDesignReview,
  formatSiteDesign,
  formatStyleTokens,
} from "../formatters/design.js";

export function registerDesignTools(server: McpServer): void {
  server.registerTool(
    "review_design",
    {
      title: "Design review — measure the design system + flag smells",
      description:
        "Zero-image DESIGN audit: the taste counterpart to scan_accessibility. " +
        "Measures the page's ACTUAL design system (color palette, type scale, " +
        "font weights/families, spacing rhythm, border-radii, shadows) and " +
        "flags 'design smells' — the amateur tells that separate a designed UI " +
        "from a generated one: too many font sizes/colors, off-grid spacing, " +
        "cramped or over-long or sub-16px body text, inconsistent radii, and " +
        "near-miss alignment — each with an addressable selector. Use it to " +
        "push a page from 'not broken' to 'looks premium'. Optionally resizes " +
        "to a breakpoint first. Includes a page-health block.",
      inputSchema: {
        url: urlField,
        viewport: optionalViewportField,
        reload: reloadField,
        maxSmells: maxSmellsField,
      },
    },
    async ({ url, viewport, reload, maxSmells }) => {
      try {
        const { review, viewport: used, health } = await session.reviewDesign(
          url,
          viewport,
          reload,
        );
        const content = [
          textBlock(formatDesignReview(review, session.currentUrl() ?? url, used)),
        ];
        const assertion: Assertion | null =
          maxSmells !== undefined
            ? {
                ok: review.smells.length <= maxSmells,
                label:
                  `${review.smells.length} design smell(s) ` +
                  `${review.smells.length <= maxSmells ? "≤" : ">"} ${maxSmells} allowed`,
              }
            : null;
        if (assertion) {
          content.push(assertionBlock(assertion));
        }
        content.push(healthBlock(health), metadataBlock());
        return finalize(content, assertion);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "extract_design_tokens",
    {
      title: "Steal this style — extract design tokens from any URL",
      description:
        "Point at any URL you admire (or a client's inspiration link) and get " +
        "a BUILDABLE design-token spec: the color palette with inferred roles " +
        "(page background, surfaces, body/other text, and the accent — " +
        "including an accent gradient if present), the type scale + body size " +
        "+ weights + fonts, the spacing base/scale, radii, and shadow style — " +
        "returned as an inferred-roles summary AND a pasteable CSS :root " +
        "variables block. Turns 'make it look like <site>' into a concrete " +
        "spec instead of guessing. Optionally saves the tokens to " +
        ".agent-eyes/styles/<name>.json to reuse or lock the style. Includes a " +
        "page-health block.",
      inputSchema: {
        url: urlField,
        viewport: optionalViewportField,
        reload: reloadField,
        saveAs: saveAsField,
      },
    },
    async ({ url, viewport, reload, saveAs }) => {
      try {
        const { tokens, savedPath, viewport: used, health } =
          await session.extractStyleTokens(url, viewport, reload, saveAs);
        return {
          content: [
            textBlock(
              formatStyleTokens(tokens, session.currentUrl() ?? url, used, savedPath),
            ),
            healthBlock(health),
            metadataBlock(),
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "extract_site_design",
    {
      title: "Steal this style — crawl a whole site into one design brief",
      description:
        "Crawl up to a handful of same-origin pages (nav links first) and " +
        "return ONE consolidated design brief: the design system merged across " +
        "pages (fonts BY ROLE incl. a display/serif vs body, color roles, type " +
        "ramp, spacing, radii, shadows — ranked by cross-page frequency, so the " +
        "real system wins), PLUS each page's section anatomy (the information " +
        "architecture) and a pasteable CSS :root + Tailwind theme. Use it to " +
        "match a reference look 1:1 — then fill in the CLIENT'S OWN copy, " +
        "images, and logos (this captures DESIGN + STRUCTURE only, never " +
        "content or assets). Optionally saves the brief to " +
        ".agent-eyes/styles/<name>.json. Includes a page-health block.",
      inputSchema: {
        url: urlField,
        maxPages: maxPagesField,
        saveAs: saveAsField,
      },
    },
    async ({ url, maxPages, saveAs }) => {
      try {
        const { site, savedPath, health } = await session.extractSiteDesign(
          url,
          maxPages,
          saveAs,
        );
        return {
          content: [
            textBlock(formatSiteDesign(site, savedPath)),
            healthBlock(health),
            metadataBlock(),
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
