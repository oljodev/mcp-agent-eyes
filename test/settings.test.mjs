import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readSettings, readBrowserConfig } from "../dist/config.js";

const origCwd = process.cwd();
const dirs = [];
function sandbox(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "ae-settings-"));
  dirs.push(root);
  mkdirSync(join(root, ".agent-eyes"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(root, ".agent-eyes", name), typeof body === "string" ? body : JSON.stringify(body));
  }
  process.chdir(root);
  for (const k of Object.keys(process.env)) if (k.startsWith("AGENT_EYES_")) delete process.env[k];
  return root;
}

afterEach(() => {
  process.chdir(origCwd);
  for (const k of Object.keys(process.env)) if (k.startsWith("AGENT_EYES_")) delete process.env[k];
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("no file → defaults; default mode is managed", () => {
  sandbox();
  const s = readSettings();
  assert.equal(s.browser.mode, "managed");
  assert.equal(s.browser.chromePath, null);
  assert.equal(s.browser.visibility, "on-demand");
  assert.equal(s.browser.keepalive, true);
  assert.equal(s.browser.headless, true);
  assert.equal(s.tabs.maxOpen, 8);
  assert.equal(s.captures.thumbnailMaxWidth, 1024);
});

test("browser.headless: file value and env override (invisible managed)", () => {
  sandbox({ "settings.json": { browser: { headless: false } } });
  assert.equal(readBrowserConfig().headless, false);
  process.env.AGENT_EYES_HEADLESS = "true";
  assert.equal(readBrowserConfig().headless, true);
  process.env.AGENT_EYES_HEADLESS = "0";
  assert.equal(readBrowserConfig().headless, false);
});

test("visibility \"always\" implies a visible window", () => {
  sandbox({ "settings.json": { browser: { visibility: "always" } } });
  assert.equal(readBrowserConfig().headless, false);
  process.env.AGENT_EYES_VISIBILITY = "on-demand";
  assert.equal(readBrowserConfig().headless, true);
});

test("canonical nested settings.json is read", () => {
  sandbox({ "settings.json": { browser: { mode: "headed", keepAlive: false }, tabs: { maxOpen: 3 } } });
  const s = readSettings();
  assert.equal(s.browser.mode, "headed");
  assert.equal(s.browser.keepalive, false);
  assert.equal(s.tabs.maxOpen, 3);
});

test("legacy FLAT config.json still loads (back-compat)", () => {
  sandbox({ "config.json": { mode: "headless", chromePath: "/x/chrome", keepalive: false } });
  const b = readBrowserConfig();
  assert.equal(b.mode, "headless");
  assert.equal(b.chromePath, "/x/chrome");
  assert.equal(b.keepalive, false);
});

test("legacy flat { headed: true } maps to mode headed", () => {
  sandbox({ "config.json": { headed: true } });
  assert.equal(readBrowserConfig().mode, "headed");
});

test("settings.json wins over a legacy config.json", () => {
  sandbox({ "config.json": { mode: "cdp", cdpUrl: "http://x:1" }, "settings.json": { browser: { mode: "headed" } } });
  assert.equal(readBrowserConfig().mode, "headed");
});

test("env var overrides the file value", () => {
  sandbox({ "settings.json": { browser: { mode: "managed" } } });
  process.env.AGENT_EYES_BROWSER = "headless";
  assert.equal(readBrowserConfig().mode, "headless");
});

test("AGENT_EYES_CDP_URL forces cdp mode", () => {
  sandbox({ "settings.json": { browser: { mode: "managed" } } });
  process.env.AGENT_EYES_CDP_URL = "http://localhost:9222";
  const b = readBrowserConfig();
  assert.equal(b.mode, "cdp");
  assert.equal(b.cdpUrl, "http://localhost:9222");
});

test("malformed file never throws → falls back to defaults", () => {
  sandbox({ "settings.json": "{ not valid json " });
  let s;
  assert.doesNotThrow(() => { s = readSettings(); });
  assert.equal(s.browser.mode, "managed");
});

test("unknown keys are ignored, known keys kept", () => {
  sandbox({ "settings.json": { browser: { mode: "headless", bogus: 1 }, extra: true } });
  assert.equal(readBrowserConfig().mode, "headless");
});

test("chromePath \"auto\" resolves to null (auto-detect)", () => {
  sandbox({ "settings.json": { browser: { chromePath: "auto" } } });
  assert.equal(readBrowserConfig().chromePath, null);
});
