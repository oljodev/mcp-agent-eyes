# agent-eyes

[![npm](https://img.shields.io/npm/v/mcp-agent-eyes)](https://www.npmjs.com/package/mcp-agent-eyes)
[![CI](https://github.com/oljodev/mcp-agent-eyes/actions/workflows/ci.yml/badge.svg)](https://github.com/oljodev/mcp-agent-eyes/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/mcp-agent-eyes)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/mcp-agent-eyes)](LICENSE)

**Visual eyes for AI coding agents.** agent-eyes is an [MCP](https://modelcontextprotocol.io) server that lets an AI agent *see* and *measure* web pages: take screenshots at real breakpoints, run zero-image DOM/layout/accessibility audits, diff against visual baselines, log into real sites (without ever seeing your password), drive multiple tabs, and **verify a fix actually reached the deployed site**. It keeps one persistent browser session alive across tool calls, and saves every screenshot full-resolution under `.agent-eyes/` for human review.

It runs a **real Chrome** by default (a clean, human-looking fingerprint), so logins and bot-protected pages (Cloudflare Turnstile, etc.) work — **invisibly**, with no window interrupting you. When a human genuinely must act (solve a CAPTCHA, approve a login), it opens a window and hands off to you. **agent-eyes never solves CAPTCHAs or bypasses anti-bot itself.**

---

## Quick start

Claude Code, one line:

```bash
claude mcp add agent-eyes -- npx -y mcp-agent-eyes
```

Any other agent — this detects your Chrome, writes a tuned `.agent-eyes/settings.json`, and prints the exact MCP config snippet:

```bash
npx mcp-agent-eyes setup
```

Want it merged into your agent's config for you?

```bash
npx mcp-agent-eyes setup --agent claude-code --write   # merges into your config (backup made)
```

Supported `--agent` values: `claude-code`, `cursor`, `codex`, `zed`, `vscode`. With no flag it prints snippets for all of them and where each config file lives.

**Requirements:** Node.js ≥ 20, and Chrome / Chromium / Edge for the default managed mode (setup tells you if it can't find one). There is **no browser download** — agent-eyes ships against `playwright-core` and drives the Chrome you already have. Nothing is installed globally; `npx` fetches a few MB and runs.

Then ask your agent something like *"screenshot localhost:3000 at mobile and tell me what's overflowing"* — no window will open; the screenshot lands in `.agent-eyes/captures/` and a thumbnail goes to the agent.

---

## Connecting your agent

Setup prints these for you, but here they are by hand. The server command is `npx -y mcp-agent-eyes` once installed (or `node /abs/path/to/dist/index.js` from a clone).

| Agent | Config file | Key |
|-------|-------------|-----|
| **Claude Code** | `~/.claude.json` (global) or `.mcp.json` (project) | `mcpServers` |
| **Cursor** | `~/.cursor/mcp.json` or `.cursor/mcp.json` | `mcpServers` |
| **OpenAI Codex CLI** | `~/.codex/config.toml` | `[mcp_servers.agent-eyes]` |
| **Zed** | `~/.config/zed/settings.json` | `context_servers` |
| **VS Code** (Copilot agent / MCP) | `.vscode/mcp.json` | `servers` |

**Claude Code / Cursor** (`mcpServers`):
```json
{ "mcpServers": { "agent-eyes": { "command": "npx", "args": ["-y", "mcp-agent-eyes"] } } }
```
Or: `claude mcp add agent-eyes -- npx -y mcp-agent-eyes`

**VS Code** (`.vscode/mcp.json`):
```json
{ "servers": { "agent-eyes": { "command": "npx", "args": ["-y", "mcp-agent-eyes"] } } }
```

**Zed** (`~/.config/zed/settings.json`):
```json
{ "context_servers": { "agent-eyes": { "source": "custom", "command": "npx", "args": ["-y", "mcp-agent-eyes"], "env": {} } } }
```

**Codex** (`~/.codex/config.toml`):
```toml
[mcp_servers.agent-eyes]
command = "npx"
args = ["-y", "mcp-agent-eyes"]
```

Restart your agent after editing its config.

---

## Why not just a screenshot MCP server?

Most browser MCP servers hand the agent a picture and stop there. A picture is the *expensive* part of the loop — it burns tokens and the agent still has to guess at numbers. agent-eyes is built around what happens after the screenshot:

| | typical screenshot MCP | agent-eyes |
|---|---|---|
| **Measurement** | agent eyeballs the image | `measure_element` returns real px, spacing, contrast ratios — **zero images** |
| **Regressions** | "looks different?" | `compare_to_baseline` / `visual_diff_regions` — pixel diffs against committed baselines |
| **Did it ship?** | you re-screenshot and squint | `verify_fix` reloads the deployed URL and returns a PASS/FAIL assertion table |
| **Token cost** | full-res image on the wire | full-res on **disk**, small WebP thumbnail on the wire, many audits return no image at all |
| **Real logins** | automation fingerprint → blocked | real Chrome, `navigator.webdriver === false`, persistent profile |
| **Credentials** | typed into a tool argument | typed by *you* into a localhost prompt; the AI never sees them |
| **When a human is needed** | dead end | `await_human_interaction` opens a window, you click, the run resumes |
| **Window in your face** | every call | never — the window only appears for a human handoff |

It also keeps one browser session alive across tool calls, so a login in step 1 is still valid in step 9.

---

## `settings.json` reference

Setup writes `.agent-eyes/settings.json`. It holds no secrets, so it's safe to commit and share with your team (it is intentionally **not** gitignored). Every key, its default, and what it does:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `browser.mode` | `"managed" \| "headless" \| "headed" \| "cdp"` | `"managed"` | How the browser is obtained. See **Browser modes**. |
| `browser.chromePath` | string | `"auto"` | `"auto"` = detect a real Chrome; or an absolute path to the executable. |
| `browser.profileDir` | string \| null | `null` | Persistent Chrome profile dir for managed mode. `null` → `~/.agent-eyes/chrome-profile`. Logins persist here. |
| `browser.cdpUrl` | string \| null | `null` | DevTools endpoint for `mode: "cdp"` (e.g. `http://localhost:9222`). |
| `browser.keepAlive` | boolean | `true` | Leave the managed Chrome running between sessions for an instant warm reconnect. |
| `browser.headless` | boolean | `true` | **Managed mode only:** run Chrome with **no visible window** (`--headless=new`) while keeping the real-Chrome fingerprint and your persistent (logged-in) profile. **No window ever appears during normal work.** When `await_human_interaction` needs a human, agent-eyes relaunches the same profile *with* a window and reopens your tabs on their URLs — so handoffs still work; only unsaved in-page state (typed-but-unsubmitted input) is lost. Set `false` to have the window open from the start. |
| `browser.visibility` | `"on-demand" \| "always"` | `"on-demand"` | `on-demand`: never steal focus during normal work — only `await_human_interaction` puts a window on screen. `always`: keep a visible window foregrounded (implies `browser.headless: false`). |
| `browser.extraFlags` | string[] | `[]` | Extra Chrome flags (e.g. `["--no-sandbox"]` in containers). |
| `tabs.maxOpen` | number | `8` | Hard cap on concurrent named tabs (`manage_tabs`). |
| `captures.thumbnailMaxWidth` | number | `1024` | Reserved for tuning the on-the-wire thumbnail width. |

Every setting also has an environment-variable override (env wins over the file): `AGENT_EYES_BROWSER`, `AGENT_EYES_CHROME_PATH`, `AGENT_EYES_PROFILE_DIR`, `AGENT_EYES_CDP_URL`, `AGENT_EYES_CHROME_KEEPALIVE`, `AGENT_EYES_HEADLESS`, `AGENT_EYES_VISIBILITY`, `AGENT_EYES_CHROME_FLAGS`. Point `AGENT_EYES_CONFIG` at a custom file path to override discovery.

---

## Browser modes

- **`managed`** (default, recommended) — agent-eyes launches and owns a **real Chrome** itself, raw-spawned (not via Playwright's automation launch), so `navigator.webdriver === false` and Cloudflare Turnstile / Google sign-in treat it as a real human browser. No manual commands. Logins persist in `profileDir`. **It runs invisibly** (`browser.headless: true`, the default): no window pops up while the agent works. The one exception is `await_human_interaction` — that relaunches the same Chrome *with* a window so you can solve the challenge, and it stays visible for the rest of the session. Want the window from the first capture instead? Set `browser.headless: false`.
- **`headless`** — Playwright's headless Chromium. Fast, no window — best for CI and pure auditing. Carries automation markers (fine for non-bot-protected sites).
- **`headed`** — a visible Playwright Chromium window. Still fingerprinted as automation; prefer `managed` for bot-protected sites.
- **`cdp`** — attach to a Chrome **you** launched with `--remote-debugging-port`. Advanced escape hatch; `managed` is the easy path.

agent-eyes always works in its **own dedicated tab** and never touches your other tabs or steals focus during normal operations. In the default managed mode there is no window at all until a human handoff asks for one.

---

## Auth & security model

agent-eyes can reach authenticated pages **without the AI ever seeing your credentials.**

- **AI-blind login.** `authenticate_login` opens a localhost secure page where *you* type the username/password into a real masked field; the server fills them into the site and returns only a page status (`success` / `otp_required` / `error` / …). The values never enter an MCP tool argument or result, never hit a log, and auth tools **never return a screenshot** (a 2FA page can render the code in plaintext).
- **2FA.** `submit_2fa_code` works the same way — you type the current code in the secure prompt; the AI never learns it.
- **Encrypted vault.** `enroll_credentials` stores a profile's credentials (+ optional TOTP seed) in an **AES-256-GCM** vault (`scrypt` KDF), encrypted at rest under a master passphrase held only in memory. There is **no plaintext-vault mode**. `vault.json` and `sessions/` are auto-gitignored. `manage_vault` makes it recoverable (status / reset / change passphrase).
- **SSO.** `authenticate_login` with `sso: "google"` reuses an existing provider session — one login, reused everywhere.
- **Human handoff for challenges.** When a page needs a real human (a Cloudflare "Verify you are human" / Turnstile, a CAPTCHA, an interstitial), `await_human_interaction` gives you a window — relaunching the invisible managed Chrome visibly, same profile and logins, tabs reopened on their URLs — and blocks until you click **Done** (or the page reaches an expected URL). **agent-eyes never solves the challenge and never bypasses anti-bot — it hands off to you, and your own click validates.** This is the whole reason it runs a real, clean browser.

---

## Multi-tab (`manage_tabs`)

Keep several real tabs open and switch between them by a label you assign — e.g. a Lovable preview in one tab and a test site in another, without closing either.

```jsonc
manage_tabs { "action": "open",   "label": "app",  "url": "https://app.example.com" }
manage_tabs { "action": "open",   "label": "test", "url": "https://staging.example.com" }
manage_tabs { "action": "list" }                 // → both tabs, which is active
manage_tabs { "action": "switch", "label": "app" }   // every other tool now acts on "app"
manage_tabs { "action": "close",  "label": "test" }
```

All other tools operate on the **active** tab. Tool calls are still serialized; multi-tab just means the other tab's state survives. The cap is `tabs.maxOpen` (default 8).

---

## `verify_fix` — did the change actually deploy?

The flow that catches *"the tool said fixed, but production still has the bug."* It **reloads** the URL (so it reads the freshly deployed DOM, not a stale tab) and evaluates small, measurable assertions, returning a per-check PASS/FAIL table + an overall verdict (a failure marks the response as an error, so CI / verify-loops catch it).

```jsonc
verify_fix {
  "url": "https://app.example.com",
  "viewport": "mobile",
  "checks": [
    { "selector": "h1.hero", "assert": "noViewportOverflow" },        // right edge ≤ viewport width
    { "selector": "h1.hero", "assert": "fontSizeAtMost", "px": 32 },  // responsive font really shipped
    { "selector": "button.cta", "assert": "minTapTarget", "px": 44 }, // ≥ 44×44
    { "selector": ".old-banner", "assert": "notExists" }
  ]
}
```

Assertions: `noViewportOverflow`, `minTapTarget` (px, default 44), `fontSizeAtMost` / `fontSizeAtLeast` (px), `exists` / `notExists`. Pass `saveAs` to snapshot the verdict under `.agent-eyes/verify/`.

---

## Tool catalog

**Capture** — `capture_page_screenshot` (one breakpoint, token-cost controls) · `matrix_responsive_audit` (all four breakpoints in one call) · `capture_element` (cropped single-element shot) · `generate_audit_gallery` (HTML contact sheet of a run)

**Layout & measurement** — `detect_layout_matrix` (zero-image DOM diagnostics across breakpoints, annotated renders) · `find_breakpoints` (where layout actually changes) · `measure_layout_shift` (CLS) · `measure_element` (tokenless inspector: dimensions, type, spacing, color, WCAG contrast) · `visual_diff_regions` (region-level pixel diff) · `compare_to_baseline` (save/diff visual baselines)

**Accessibility** — `scan_accessibility` (WCAG foundation audit: alt text, heading order, names)

**Design** — `review_design` (design-system audit + "smells") · `extract_design_tokens` ("steal this style" → CSS variables) · `extract_site_design` (whole-site design summary)

**Interaction** — `interact_and_audit` (click/type/hover/scroll **or `pointer_*` on pixel coordinates**, then screenshot + layout audit) · `run_interaction_sequence` (batch steps, one shot + audit at the end) · `wait_for_response` (await a network response) · `mock_route` (stub responses for deterministic captures)

Both interaction tools also accept **pointer gestures driven by viewport pixel coordinates** read straight off a screenshot — no selector needed, so they reach anything visible regardless of DOM: shadow DOM components, `<canvas>`/WebGL, maps and charts, and drag-and-drop UIs. `pointer_click {x, y, button?}` · `pointer_hover {x, y}` · `pointer_drag {startX, startY, endX, endY, steps?}`. Coordinates are bounds-checked against the current viewport.

`run_interaction_sequence` additionally supports an **`evaluate_script` step** that reads structured page state into the result — far cheaper than a screenshot when you just need a count, some text, an attribute, or a computed style:

```jsonc
run_interaction_sequence { "url": "…", "steps": [
  { "action": "evaluate_script", "script": "return document.title",                       "label": "page-title" },
  { "action": "evaluate_script", "script": "return document.querySelectorAll('a').length", "label": "link-count" }
] }
```

The `script` runs as an async function body (use `await`; you **must `return` a JSON-serializable value**); each result is surfaced under its `label` (or the step number). A throwing script fails that step like any other. This is part of the sequence step vocabulary and is **always available** — distinct from the standalone, opt-in `evaluate_script` *tool* (which still requires `AGENT_EYES_ALLOW_EVAL=1`).

**Auth** — `authenticate_login` · `submit_2fa_code` · `enroll_credentials` · `manage_vault` · `await_human_interaction`

**Session & tabs** — `manage_session` (cookies / localStorage / headers / storageState) · `manage_tabs`

**Verify** — `verify_fix`

**Opt-in** — `evaluate_script` (run JS in the page; exposed only when `AGENT_EYES_ALLOW_EVAL=1`)

---

## Persistence model

Every screenshot-producing tool saves its full-resolution render under `.agent-eyes/captures/run-<n>-<page>/` and reports the path; a small webp thumbnail goes on the wire to keep token cost low. An auto-generated `.agent-eyes/.gitignore` keeps `captures/`, `gallery.html`, `sessions/`, and `vault.json` out of git (baselines stay committable; so does `settings.json`). Every response also ends with a page-health block (console errors, failed requests, 4xx/5xx, blank-page detection) and a `[Metadata: agent-eyes vX.Y.Z]` version tag.

Logs go to **stderr** only; stdout is reserved for the MCP protocol.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Managed browser mode could not find Google Chrome` | Install Chrome/Chromium/Edge, or set `browser.chromePath` to its executable (or `browser.mode: "headless"`). |
| Cloudflare Turnstile shows a "widget error" | You're not in managed mode — set `browser.mode: "managed"` (a real, clean Chrome). |
| Managed Chrome won't start in a container | Add `"--no-sandbox"` to `browser.extraFlags` (only if you trust the environment). |
| `Chromium is not installed for Playwright` (headless / headed mode) | `npx playwright-core install chromium` — only these modes need a downloaded browser; managed mode uses your system Chrome. |
| `Nothing is listening at http://localhost:…` | Start your dev server first. |

---

## Development

```bash
git clone https://github.com/oljodev/mcp-agent-eyes.git
cd mcp-agent-eyes
npm install
npm run build      # tsc → dist/
npm test           # node --test (unit suite: config, chrome detection, login classifier, vault crypto, verify asserts)
```

The unit suite never launches a browser, so it runs anywhere. Point your agent at `node /abs/path/to/dist/index.js` to run your working copy. Layout, conventions, and PR expectations: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## Contributing & support

- **Bugs and ideas:** [open an issue](https://github.com/oljodev/mcp-agent-eyes/issues) — include your agent, OS, and the `[Metadata: agent-eyes vX.Y.Z]` line from a tool response.
- **Pull requests:** welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md).
- **Security:** report privately, see [SECURITY.md](SECURITY.md). agent-eyes handles credentials and runs a real browser; please don't file those in public issues.
- **What changed:** [CHANGELOG.md](CHANGELOG.md).

---

## License

MIT © Stein Magnus Jodal
