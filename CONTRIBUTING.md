# Contributing

Thanks for taking a look. Issues and pull requests are welcome.

## Getting set up

```bash
git clone https://github.com/oljodev/mcp-agent-eyes.git
cd mcp-agent-eyes
npm install
npm run build      # tsc → dist/
npm test           # pretest compiles, then runs the unit suite
```

Requires **Node.js ≥ 20**. The unit suite is pure logic and never launches a
browser, so it runs anywhere. To exercise the real thing you need Chrome,
Chromium, or Edge installed (see the README's **Browser modes**).

### Running your working copy against a real agent

Point your MCP config at the build instead of the published package:

```json
{ "mcpServers": { "agent-eyes": { "command": "node", "args": ["/abs/path/to/mcp-agent-eyes/dist/index.js"] } } }
```

`npm run watch` keeps `dist/` current while you edit; restart your agent to pick
up changes.

## How the code is laid out

```
src/
  index.ts          entry point (stdio transport)
  server.ts         registers every tool
  config.ts         settings.json + env resolution — the single source of truth
  browser/          the stateful session: core, acquire, managed Chrome, navigation…
  ops/              one file per tool operation, called by the registrations
  tools/register/   MCP tool definitions (schema + description + formatting)
  auth/             secure prompt, vault crypto, TOTP, redaction
  types/            shared types, zod fields, timeouts, viewports
test/               node:test unit suites (*.test.mjs, run against dist/)
```

Two conventions worth knowing:

- **`ops/` never registers, `tools/register/` never orchestrates.** A tool's
  schema and its output formatting live in `tools/register/`; the logic lives in
  `ops/` as a free function taking the session.
- **Logs go to stderr only.** stdout carries the MCP protocol; a stray
  `console.log` corrupts the stream.

## Pull requests

- Keep the diff focused, and match the surrounding style — the codebase leans on
  explanatory comments that say *why*, not *what*.
- Add or update a unit test when you change logic that can be tested without a
  browser (config resolution, classifiers, crypto, assertions).
- Run `npm test` before pushing. CI runs the same thing on Node 20, 22, and 24.
- If you change a tool's inputs, outputs, or defaults, update the README's tool
  catalog or settings table in the same PR.
- New user-visible behavior gets a line in [CHANGELOG.md](CHANGELOG.md) under
  "Unreleased".

## Things that won't be merged

CAPTCHA solving, anti-bot evasion, or anything that makes credentials visible to
the AI. See [SECURITY.md](SECURITY.md) for the reasoning.

## Releasing (maintainer)

```bash
npm version minor        # or patch — see CHANGELOG conventions; commits and tags
git push --follow-tags
```

agent-eyes is installed straight from GitHub (`npx github:oljodev/mcp-agent-eyes`),
so a release is a tag on `main` — there is no registry to publish to. The
`prepare` script is what makes that work: it builds `dist/` on install, so keep
it working and never commit `dist/` itself.
