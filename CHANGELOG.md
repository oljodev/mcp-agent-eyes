# Changelog

Notable changes to agent-eyes. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Versioning while in `0.x`: **minor** bumps carry features and behavior changes,
**patch** bumps carry bug fixes. A `1.0.0` is a deliberate public-launch
decision, not an automatic consequence of a change.

## [Unreleased]

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

[Unreleased]: https://github.com/oljodev/mcp-agent-eyes/compare/v0.28.0...HEAD
[0.28.0]: https://github.com/oljodev/mcp-agent-eyes/releases/tag/v0.28.0
