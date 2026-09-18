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
        "Zero-image DESIGN audit — the taste counterpart to " +
        "scan_accessibility. Measures the page's actual design system " +
        "(palette, type scale, weights and families, spacing rhythm, radii, " +
        "shadows) and flags design smells: too many font sizes or colors, " +
        "off-grid spacing, cramped or over-long or sub-16px body text, " +
        "inconsistent radii, near-miss alignment — each with an addressable " +
        "selector.",
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
        "Turn \"make it look like <site>\" into a buildable spec: the palette " +
        "with inferred roles (page background, surfaces, text, accent, accent " +
        "gradient), the type scale, body size, weights and fonts, the spacing " +
        "base and scale, radii and shadows — as an inferred-roles summary " +
        "plus a pasteable CSS :root block. Optionally saved to " +
        ".agent-eyes/styles/.",
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
        "Crawl a handful of same-origin pages (nav links first) and return " +
        "ONE consolidated design brief: the system merged across pages — " +
        "fonts by role, color roles, type ramp, spacing, radii, shadows, " +
        "ranked by cross-page frequency so the real system wins — plus each " +
        "page's section anatomy and a pasteable CSS :root + Tailwind theme. " +
        "Design and structure only, never copy, images, or logos.",
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
