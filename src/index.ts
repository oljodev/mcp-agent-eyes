#!/usr/bin/env node
/**
 * agent-eyes — an MCP server that gives AI agents visual eyes on the web,
 * with a persistent visual design memory.
 *
 * Exposes the tool surface over stdio (one extra, evaluate_script, when
 * AGENT_EYES_ALLOW_EVAL=1). A non-exhaustive tour of the core tools:
 *
 *   - capture_page_screenshot:  screenshot a URL at a named breakpoint with
 *                               token-cost controls (webp/jpeg/png, quality,
 *                               maxWidth, thumb mode)
 *   - matrix_responsive_audit:  all four breakpoints in one call, always
 *                               lossy-compressed (webp q75)
 *   - compare_to_baseline:      save/diff visual baselines stored under
 *                               .agent-eyes/baselines/ with pixel-drift
 *                               metrics and a delta overlay image
 *   - detect_layout_matrix:     zero-image DOM diagnostics across ALL four
 *                               breakpoints with unique, addressable
 *                               selectors — plus red-outline annotated
 *                               renders saved to disk
 *   - interact_and_audit:       click/type/hover/scroll the live page
 *                               (optionally switching breakpoint first),
 *                               then return BOTH a compressed screenshot and
 *                               a fresh layout audit of the resulting state
 *   - measure_element:          tokenless inspector — computed dimensions,
 *                               typography, spacing, effective colors, and
 *                               a WCAG contrast verdict (gradient-aware)
 *                               for one element
 *   - scan_accessibility:       zero-image WCAG foundation audit — image
 *                               alternates, heading hierarchy, accessible
 *                               names — as a grouped text report
 *   - review_design:            zero-image design audit — measures the design
 *                               system (palette, type scale, spacing, radii)
 *                               and flags "design smells" with selectors
 *   - extract_design_tokens:    "steal this style" — extract a buildable token
 *                               spec (palette+roles, type/spacing scale, radii,
 *                               fonts) from any URL as CSS variables
 *   - run_interaction_sequence: batch pipeline — execute many steps
 *                               back-to-back, with ONE screenshot + ONE
 *                               layout audit after the final step
 *   - manage_session:           set/clear cookies, localStorage, and headers,
 *                               or save/load a storageState snapshot, to
 *                               reach authenticated pages
 *   - authenticate_login:       log in with the user's account WITHOUT the AI
 *                               seeing the credentials — the human enters them
 *                               in a localhost secure prompt; returns a page
 *                               status (success / otp_required / error / ...)
 *   - submit_2fa_code:          complete a 2FA challenge the same AI-blind way
 *                               — the human types the code in the secure prompt
 *   - enroll_credentials:       store a profile's credentials (+ optional TOTP
 *                               seed) in an AES-256-GCM vault so later logins
 *                               run unattended (authenticate_login source=vault,
 *                               submit_2fa_code source=totp)
 *   - evaluate_script:          (opt-in via AGENT_EYES_ALLOW_EVAL) run a JS
 *                               snippet in the page and return its JSON result
 *   - mock_route:               stub network routes with canned responses for
 *                               deterministic captures
 *   - wait_for_response:        wait for a network response (optionally around
 *                               a trigger) and report its metadata
 *   - generate_audit_gallery:   build .agent-eyes/gallery.html, a sortable
 *                               contact sheet of a run's saved captures
 *
 * Every response (success and error) ends with a version metadata tag,
 * [Metadata: agent-eyes vX.Y.Z], so agents can detect a stale, not-restarted
 * server process after a rebuild.
 *
 * Persistence-first: every screenshot is saved full-resolution under
 * .agent-eyes/captures/run-<n>-<page>/<shot-folder>/ and its path is reported,
 * so the full visual context lives on disk while the chat can carry cheap
 * thumbnails. Every response also carries a page-health block (console
 * errors, uncaught exceptions, failed requests, 4xx/5xx, blank-page
 * detection) covering everything since the previous response.
 *
 * This file is the process entry point only; the server assembly lives in
 * server.ts, the tool surface in tools/, the engine in browser/, and the
 * shared types in types/.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { securePrompt } from "./auth/secure-prompt.js";
import { vault } from "./auth/vault.js";
import { session } from "./browser/session.js";
import { ensureSettingsFile } from "./config.js";
import { buildServer } from "./server.js";
import { runSetup } from "./setup.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";

let shuttingDown = false;

async function shutdown(code: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  vault.lock();
  await securePrompt.close().catch(() => undefined);
  await session.close().catch(() => undefined);
  process.exit(code);
}

async function main(): Promise<void> {
  // `mcp-agent-eyes setup` runs the onboarding CLI instead of the stdio server.
  if (process.argv[2] === "setup") {
    await runSetup(process.argv.slice(3));
    process.exit(0);
  }

  // Auto-create .agent-eyes/settings.json with defaults on first run.
  ensureSettingsFile();
  const server = buildServer();
  const transport = new StdioServerTransport();

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  // When the client closes the stdio pipe, release the browser too.
  server.server.onclose = () => void shutdown(0);

  await server.connect(transport);
  // stdout carries the MCP protocol — all logging must go to stderr.
  console.error(`${SERVER_NAME} ${SERVER_VERSION} ready on stdio`);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting MCP server:", error);
  void shutdown(1);
});
