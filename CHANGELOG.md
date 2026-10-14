# Changelog

Notable changes to agent-eyes. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Versioning while in `0.x`: **minor** bumps carry features and behavior changes,
**patch** bumps carry bug fixes. A `1.0.0` is a deliberate public-launch
decision, not an automatic consequence of a change.

## [Unreleased]

### Removed

- **All credential handling.** `authenticate_login`, `submit_2fa_code`,
  `enroll_credentials` and `manage_vault` are gone, along with the encrypted
  vault, TOTP, SSO helper, login classifier and error redaction. Sign in by hand
  through `await_human_interaction`; the session persists in the Chrome profile.
  `await_human_interaction` and `manage_session` are unchanged.

### Changed

- **`browser.keepAlive` now defaults to `false`.** The managed Chrome (and its
  local DevTools port) no longer outlives the server. Set it to `true` to keep
  the old instant warm reconnect; sign-ins persist in the profile either way.

### Fixed

- A failed tool call no longer leaks its page-health entries (e.g. a refused
  navigation) into the next, unrelated response.
- The first navigation after a failed one no longer errors with "interrupted by
  another navigation to about:blank".
- `/favicon.ico` 404s no longer appear in page health.
- Design tokens: the page background comes from `body`/`html`, type-ramp roles
  follow the heading tag actually seen (an `h3` is no longer labelled `h1`),
  generic font families are not quoted in CSS output, and unclassified page
  sections show their tag/id/class instead of a bare "generic".
- Tool arguments are validated strictly: an unknown or misplaced argument is a
  clear error instead of being silently dropped.

## [0.29.0] — 2026-09-18

### Changed

- **The tool list costs ~35% fewer tokens: 19.0k → 12.4k.** That payload is
  resent on every request in every conversation the server is connected to,
  used or not, so it was the single largest token cost in the project — larger
  than any screenshot. Shared field descriptions were the worst offender: the
  `reload` field shipped the same 362-character paragraph in 14 tools, costing
  ~1.2k tokens per request on its own. Field prose is now terse, and tool
  descriptions state what a tool does, returns, and requires rather than
  explaining the reasoning behind it (that lives in the README).
- The page-health line on a clean response is now `Page health: OK` instead of
  a sentence spelling out what OK means — ~26 tokens back on every tool call.

No tool was removed, renamed, or had an argument changed; only the prose that
describes them.

## [0.28.0] — 2026-09-18

### Changed

- **The managed Chrome window no longer opens during normal work.**
  `browser.headless` now defaults to `true`, so the real Chrome runs with
  `--headless=new`: same clean fingerprint, same persistent logged-in profile,
  no window in your face while the agent captures and audits.
- `await_human_interaction` now *creates* the window it needs. Playwright cannot
  switch a running browser to headed, so the handoff relaunches the same profile
  visibly and reopens your tabs on their URLs; cookies and logins survive (they
  live in the profile), unsaved in-page state does not. The browser then stays
  visible for the rest of the session.
- `browser.visibility: "always"` now implies a visible window — it means "keep
  the window foregrounded", which has no meaning without one.
- Dependency slimmed from `playwright` to `playwright-core`: installing no
  longer downloads a ~150 MB browser bundle that managed mode never uses.
  `browser.mode: "headless"` / `"headed"` now need
  `npx playwright-core install chromium` once.

### Note for existing users

`.agent-eyes/settings.json` files written by an earlier version pin the old
`"headless": false`. Set it to `true` (or delete the file and re-run setup) to
get the windowless behavior.

Releases before 0.28.0 predate this public repository and have no changelog
entries.

[Unreleased]: https://github.com/oljodev/mcp-agent-eyes/compare/v0.29.0...HEAD
[0.29.0]: https://github.com/oljodev/mcp-agent-eyes/releases/tag/v0.29.0
[0.28.0]: https://github.com/oljodev/mcp-agent-eyes/releases/tag/v0.28.0
