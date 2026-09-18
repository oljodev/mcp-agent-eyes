# agent-eyes

[![CI](https://github.com/oljodev/mcp-agent-eyes/actions/workflows/ci.yml/badge.svg)](https://github.com/oljodev/mcp-agent-eyes/actions/workflows/ci.yml)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![license](https://img.shields.io/github/license/oljodev/mcp-agent-eyes)](LICENSE)

**Visual eyes for AI coding agents.** An [MCP](https://modelcontextprotocol.io) server that lets your agent *see* and *measure* web pages instead of guessing at them: screenshots at real breakpoints, zero-image layout and accessibility audits, pixel diffs against committed baselines, logins to real sites without ever seeing your password, and a check that a fix **actually reached the deployed site**.

It drives a **real Chrome** — invisibly. No window opens while your agent works; the browser only becomes visible when a human genuinely has to act, like solving a CAPTCHA. One browser session stays alive across tool calls, so a login in step 1 still holds in step 9.

---

## Install

One command. It detects your Chrome, writes a tuned `.agent-eyes/settings.json`, and adds the server to your agent's MCP config (keeping a backup of it):

```bash
npx -y github:oljodev/mcp-agent-eyes setup --agent claude-code --write
```

Swap `--agent` for `cursor`, `codex`, `zed`, or `vscode`. Drop `--write` to print the config instead of touching any file; drop `--agent` to see all five and where each config file lives. **Restart your agent afterwards** so it picks up the server.

agent-eyes installs straight from GitHub — there's no npm package to add and nothing lands in your global `node_modules`. The first run builds from source and can take a minute; after that npx caches it and startup is instant.

To update later, clear the cached copy and rerun the command: `rm -rf ~/.npm/_npx` (or pin a tag with `github:oljodev/mcp-agent-eyes#v0.28.0`).

**Requirements:** Node.js ≥ 20, and Chrome / Chromium / Edge (the installer tells you if it can't find one). **Nothing is installed globally and no browser is downloaded** — agent-eyes builds on `playwright-core` and drives the Chrome you already have.

<details>
<summary><b>Prefer to wire it up yourself?</b></summary>

Claude Code, in one line:

```bash
claude mcp add agent-eyes -- npx -y github:oljodev/mcp-agent-eyes
```

Or edit the config by hand. The server command is `npx -y github:oljodev/mcp-agent-eyes`, or `node /abs/path/to/mcp-agent-eyes/dist/index.js` if you're running a clone.

| Agent | Config file | Key |
|-------|-------------|-----|
| **Claude Code** | `~/.claude.json` (global) or `.mcp.json` (project) | `mcpServers` |
| **Cursor** | `~/.cursor/mcp.json` or `.cursor/mcp.json` | `mcpServers` |
| **OpenAI Codex CLI** | `~/.codex/config.toml` | `[mcp_servers.agent-eyes]` |
| **Zed** | `~/.config/zed/settings.json` | `context_servers` |
| **VS Code** (Copilot agent) | `.vscode/mcp.json` | `servers` |

Claude Code / Cursor:
```json
{ "mcpServers": { "agent-eyes": { "command": "npx", "args": ["-y", "github:oljodev/mcp-agent-eyes"] } } }
```

VS Code:
```json
{ "servers": { "agent-eyes": { "command": "npx", "args": ["-y", "github:oljodev/mcp-agent-eyes"] } } }
```

Zed:
```json
{ "context_servers": { "agent-eyes": { "source": "custom", "command": "npx", "args": ["-y", "github:oljodev/mcp-agent-eyes"], "env": {} } } }
```

Codex:
```toml
[mcp_servers.agent-eyes]
command = "npx"
args = ["-y", "github:oljodev/mcp-agent-eyes"]
```

</details>

---

## First things to try

Just ask your agent in plain language — it picks the tools.

> *"Screenshot localhost:3000 at mobile and tell me what's overflowing."*

No window opens. The full-resolution capture lands in `.agent-eyes/captures/`, a small thumbnail goes to the agent, and it answers with the elements whose right edge crosses 393 px.

> *"Check this page at every breakpoint and show me where the layout breaks."*

`matrix_responsive_audit` shoots all four breakpoints in one call; `detect_layout_matrix` returns the diagnosis as **text, with no images at all** — overflow, collisions, tap targets under 44 px, unreadable font sizes.

> *"I fixed the hero on mobile — did it actually deploy?"*

`verify_fix` reloads the live URL and returns a PASS/FAIL table, so "it works on my machine" gets checked against what's actually serving.

> *"Log into the staging site and screenshot the dashboard."*

A prompt opens on localhost, **you** type the password into a masked field, and the agent gets back `success` — never the credentials.

---

## Why not just a screenshot MCP server?

Most browser MCP servers hand the agent a picture and stop. The picture is the *expensive* part of the loop: it burns tokens, and the agent still has to guess at numbers. agent-eyes is built around everything that happens after the screenshot.

| | typical screenshot MCP | agent-eyes |
|---|---|---|
| **Measurement** | agent eyeballs the image | `measure_element` returns real px, spacing, and WCAG contrast — **zero images** |
| **Regressions** | "looks different?" | `compare_to_baseline` / `visual_diff_regions` — pixel diffs against committed baselines |
| **Did it ship?** | re-screenshot and squint | `verify_fix` reloads the deployed URL and returns a PASS/FAIL assertion table |
| **Token cost** | full-res image on the wire | full-res on **disk**, a small WebP thumbnail on the wire, many audits return no image at all |
| **Real logins** | automation fingerprint → blocked | real Chrome, `navigator.webdriver === false`, persistent profile |
| **Credentials** | typed into a tool argument | typed by *you* into a localhost prompt; the AI never sees them |
| **When a human is needed** | dead end | `await_human_interaction` opens a window, you click, the run resumes |
| **Windows in your face** | every call | none — a window appears only for a human handoff |

---

## The tools

Four breakpoints are shared by every tool that takes one: `mobile` (393×852), `tablet` (768×1024), `desktop` (1440×900), `ultrawide` (1920×1080). Agents reason about them by name instead of inventing pixel sizes.

**Capture**
`capture_page_screenshot` (one breakpoint, with token-cost controls) · `matrix_responsive_audit` (all four in one call) · `capture_element` (cropped single element) · `generate_audit_gallery` (HTML contact sheet of a run)

**Layout & measurement**
`detect_layout_matrix` (zero-image DOM diagnostics across breakpoints, plus annotated renders) · `find_breakpoints` (where layout actually changes) · `measure_element` (tokenless inspector: dimensions, spacing, color, contrast) · `measure_layout_shift` (CLS) · `visual_diff_regions` (region-level pixel diff) · `compare_to_baseline` (save and diff visual baselines)

**Accessibility**
`scan_accessibility` — WCAG foundations: alt text, heading order, accessible names

**Design**
`review_design` (design-system audit and "smells") · `extract_design_tokens` ("steal this style" → CSS variables) · `extract_site_design` (whole-site summary)

**Interaction**
`interact_and_audit` (click/type/hover/scroll, then screenshot + audit) · `run_interaction_sequence` (batch steps, one capture at the end) · `label_interactives` (number every clickable thing on screen and return a legend of exact selectors) · `wait_for_response` (await a network response) · `mock_route` (stub responses for deterministic captures)

**Auth** — `authenticate_login` · `submit_2fa_code` · `enroll_credentials` · `manage_vault` · `await_human_interaction`

**Session & tabs** — `manage_session` (cookies / localStorage / headers / storageState) · `manage_tabs`

**Verify** — `verify_fix`

**Opt-in** — `evaluate_script` (run JS in the page; exposed only when `AGENT_EYES_ALLOW_EVAL=1`)

<details>
<summary><b>Picking elements without guessing selectors</b></summary>

`label_interactives` paints a numbered badge over every interactive element in the viewport and returns the marked screenshot plus a legend mapping each number to a stable, unique selector and its accessible label. The agent picks the element off the picture by number, then acts on its exact selector — no selector guessing, no brittle `nth-child`. The overlay is removed after capture.

Both interaction tools also accept **pointer gestures in viewport pixel coordinates** read straight off a screenshot, so they reach anything visible regardless of DOM: shadow-DOM components, `<canvas>`/WebGL, maps, charts, drag-and-drop. `pointer_click {x, y, button?}` · `pointer_hover {x, y}` · `pointer_drag {startX, startY, endX, endY, steps?}`. Coordinates are bounds-checked against the current viewport.

</details>

<details>
<summary><b>Reading page state without spending a screenshot</b></summary>

`run_interaction_sequence` supports an `evaluate_script` **step** — far cheaper than an image when the agent just needs a count, some text, or a computed style:

```jsonc
run_interaction_sequence { "url": "…", "steps": [
  { "action": "evaluate_script", "script": "return document.title",                        "label": "page-title" },
  { "action": "evaluate_script", "script": "return document.querySelectorAll('a').length", "label": "link-count" }
] }
```

The script runs as an async function body (use `await`; you **must `return` a JSON-serializable value**) and each result is surfaced under its `label`. This step is always available — distinct from the standalone opt-in `evaluate_script` *tool*, which still requires `AGENT_EYES_ALLOW_EVAL=1`.

</details>

---

## Recipes

### `verify_fix` — did the change actually deploy?

The flow that catches *"the tool said fixed, but production still has the bug."* It **reloads** the URL, so it reads the freshly deployed DOM rather than a stale tab, then evaluates small measurable assertions and returns a per-check verdict. A failure marks the whole response as an error, so verify-loops and CI notice.

```jsonc
verify_fix {
  "url": "https://app.example.com",
  "viewport": "mobile",
  "checks": [
    { "selector": "h1.hero",     "assert": "noViewportOverflow" },        // right edge ≤ viewport width
    { "selector": "h1.hero",     "assert": "fontSizeAtMost", "px": 32 },  // the responsive font really shipped
    { "selector": "button.cta",  "assert": "minTapTarget",   "px": 44 },  // ≥ 44×44
    { "selector": ".old-banner", "assert": "notExists" }
  ]
}
```

Assertions: `noViewportOverflow`, `minTapTarget` (px, default 44), `fontSizeAtMost` / `fontSizeAtLeast` (px), `exists` / `notExists`. Pass `saveAs` to snapshot the verdict under `.agent-eyes/verify/`.

### Multiple tabs at once

Keep several real tabs open and switch by a label you assign — a preview in one, a staging site in another, neither losing its state.

```jsonc
manage_tabs { "action": "open",   "label": "app",  "url": "https://app.example.com" }
manage_tabs { "action": "open",   "label": "test", "url": "https://staging.example.com" }
manage_tabs { "action": "list" }                     // → both tabs, which is active
manage_tabs { "action": "switch", "label": "app" }   // every other tool now acts on "app"
manage_tabs { "action": "close",  "label": "test" }
```

Every other tool operates on the **active** tab. Calls are still serialized; multi-tab just means the other tab's state survives. The cap is `tabs.maxOpen` (default 8).

---

## Auth & security model

agent-eyes reaches authenticated pages **without the AI ever seeing your credentials.**

- **AI-blind login.** `authenticate_login` opens a localhost page where *you* type the username and password into a real masked field. The server fills them into the site and returns only a status (`success` / `otp_required` / `error` / …). The values never enter a tool argument, a tool result, or a log — and auth tools **never return a screenshot**, since a 2FA page can render the code in plaintext.
- **2FA.** `submit_2fa_code` works the same way; you type the current code, the AI never learns it.
- **Encrypted vault.** `enroll_credentials` stores a profile's credentials (and optional TOTP seed) in an **AES-256-GCM** vault with an `scrypt` KDF, under a master passphrase held only in memory. There is **no plaintext-vault mode**. `vault.json` and `sessions/` are auto-gitignored; `manage_vault` handles status, reset, and passphrase changes.
- **SSO.** `authenticate_login` with `sso: "google"` reuses an existing provider session — log in once, reuse everywhere.
- **Human handoff.** When a page needs a real human — Cloudflare Turnstile, a CAPTCHA, an interstitial — `await_human_interaction` gives you a window (relaunching the invisible Chrome visibly, same profile and logins, tabs reopened on their URLs) and blocks until you click **Done** or the page reaches an expected URL. **agent-eyes never solves the challenge and never bypasses anti-bot protection — it hands off to you, and your own click is what validates.** That's the whole reason it runs a real, clean browser.

Full details, including what agent-eyes touches on your machine: [SECURITY.md](SECURITY.md).

---

## Configuration

Setup writes `.agent-eyes/settings.json`. It holds no secrets, so it's safe to commit and share with your team — it's intentionally **not** gitignored.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `browser.mode` | `"managed" \| "headless" \| "headed" \| "cdp"` | `"managed"` | How the browser is obtained — see below. |
| `browser.chromePath` | string | `"auto"` | `"auto"` detects a real Chrome; or give an absolute path. |
| `browser.profileDir` | string \| null | `null` | Persistent Chrome profile for managed mode. `null` → `~/.agent-eyes/chrome-profile`. Logins live here. |
| `browser.cdpUrl` | string \| null | `null` | DevTools endpoint for `mode: "cdp"` (e.g. `http://localhost:9222`). |
| `browser.keepAlive` | boolean | `true` | Leave the managed Chrome running between sessions for an instant warm reconnect. |
| `browser.headless` | boolean | `true` | **Managed mode only:** run Chrome with **no visible window** (`--headless=new`), keeping the real-Chrome fingerprint and your logged-in profile. A handoff relaunches the same profile *with* a window and reopens your tabs, so only unsaved in-page state is lost. Set `false` to see the window from the first capture. |
| `browser.visibility` | `"on-demand" \| "always"` | `"on-demand"` | `on-demand`: never steal focus — only `await_human_interaction` puts a window on screen. `always`: keep a visible window foregrounded (implies `headless: false`). |
| `browser.extraFlags` | string[] | `[]` | Extra Chrome flags, e.g. `["--no-sandbox"]` in containers. |
| `tabs.maxOpen` | number | `8` | Hard cap on concurrent named tabs. |
| `captures.thumbnailMaxWidth` | number | `1024` | Reserved for tuning the on-the-wire thumbnail width. |

Every setting has an environment-variable override, and env wins over the file: `AGENT_EYES_BROWSER`, `AGENT_EYES_CHROME_PATH`, `AGENT_EYES_PROFILE_DIR`, `AGENT_EYES_CDP_URL`, `AGENT_EYES_CHROME_KEEPALIVE`, `AGENT_EYES_HEADLESS`, `AGENT_EYES_VISIBILITY`, `AGENT_EYES_CHROME_FLAGS`. Point `AGENT_EYES_CONFIG` at a custom path to override discovery entirely.

### Browser modes

- **`managed`** (default) — agent-eyes launches and owns a real Chrome itself, raw-spawned rather than through Playwright's automation launch, so `navigator.webdriver === false` and Turnstile or Google sign-in treat it as a human browser. No manual commands, logins persist in `profileDir`, and **it runs with no window**. The sole exception is `await_human_interaction`, which relaunches it visibly so you can act; it stays visible for the rest of that session.
- **`headless`** — Playwright's headless Chromium. Fast and windowless, good for CI and pure auditing, but carries automation markers. Needs `npx playwright-core install chromium` once.
- **`headed`** — a visible Playwright Chromium window. Still fingerprinted as automation; prefer `managed` for protected sites.
- **`cdp`** — attach to a Chrome **you** launched with `--remote-debugging-port`. An escape hatch; `managed` is the easy path.

agent-eyes always works in its **own dedicated tab** and never touches your other tabs or steals focus.

---

## Where things are saved

Every screenshot-producing tool writes its full-resolution render to `.agent-eyes/captures/run-<n>-<page>/` and reports the path, while only a small WebP thumbnail goes on the wire. An auto-generated `.agent-eyes/.gitignore` keeps `captures/`, `gallery.html`, `sessions/`, and `vault.json` out of git — baselines stay committable, so visual checkpoints can be shared with your team, and so does `settings.json`.

Every response ends with a page-health block (console errors, failed requests, 4xx/5xx, blank-page detection) and a `[Metadata: agent-eyes vX.Y.Z]` tag. Logs go to **stderr** only; stdout is reserved for the MCP protocol.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Managed browser mode could not find Google Chrome` | Install Chrome/Chromium/Edge, or set `browser.chromePath` to the executable. |
| Cloudflare Turnstile shows a "widget error" | You're not in managed mode — set `browser.mode: "managed"` for a real, clean Chrome. |
| Managed Chrome won't start in a container | Add `"--no-sandbox"` to `browser.extraFlags`, if you trust the environment. |
| `Chromium is not installed for Playwright` | `npx playwright-core install chromium`. Only `headless`/`headed` need a downloaded browser; managed mode uses your system Chrome. |
| `Nothing is listening at http://localhost:…` | Start your dev server first. |
| The agent says it has no tools | Restart your agent after editing its MCP config. |
| `npm error 404 … mcp-agent-eyes` | Your config names a bare package name. agent-eyes is installed from GitHub — the spec must be `github:oljodev/mcp-agent-eyes`. |
| Server fails to start the first time, works after | The first `npx` run builds from source and can outlast your agent's MCP startup timeout. Run the install command once in a terminal, then restart your agent. |

---

## Development

```bash
git clone https://github.com/oljodev/mcp-agent-eyes.git
cd mcp-agent-eyes
npm install
npm run build      # tsc → dist/
npm test           # config, Chrome detection, login classifier, vault crypto, verify asserts
```

The unit suite never launches a browser, so it runs anywhere. Point your agent at `node /abs/path/to/dist/index.js` to drive your working copy. Code layout, conventions, and PR expectations live in [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

- **Bugs and ideas:** [open an issue](https://github.com/oljodev/mcp-agent-eyes/issues) — include your agent, your OS, and the `[Metadata: agent-eyes vX.Y.Z]` line from a tool response.
- **Security:** report privately — see [SECURITY.md](SECURITY.md). agent-eyes handles credentials and runs a real browser, so please don't file those in public issues.
- **What changed:** [CHANGELOG.md](CHANGELOG.md).

## License

MIT © Olav Jodal
