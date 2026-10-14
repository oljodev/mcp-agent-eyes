import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  UPDATE_COMMAND,
  compareVersions,
  detectInstall,
  updateHint,
  updateInstructions,
} from "../dist/update.js";

test("compareVersions orders dotted versions numerically", () => {
  assert.equal(compareVersions("0.29.0", "0.30.0"), -1);
  assert.equal(compareVersions("0.30.0", "0.29.9"), 1);
  assert.equal(compareVersions("0.30.0", "v0.30.0"), 0);
  assert.equal(compareVersions("0.9.0", "0.10.0"), -1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
});

test("detectInstall finds the npx cache dir to remove", () => {
  const root = join("/home/u/.npm/_npx/abc123/node_modules/mcp-agent-eyes");
  const k = detectInstall(root);
  assert.equal(k.kind, "npx");
  assert.equal(k.cacheDir, join("/home/u/.npm/_npx/abc123"));
});

test("detectInstall recognises a git clone and otherwise says unknown", () => {
  const clone = mkdtempSync(join(tmpdir(), "ae-clone-"));
  mkdirSync(join(clone, ".git"));
  assert.equal(detectInstall(clone).kind, "clone");
  assert.equal(detectInstall(mkdtempSync(join(tmpdir(), "ae-none-"))).kind, "unknown");
});

test("the update text an agent reads carries the one command", () => {
  assert.match(UPDATE_COMMAND, /^npx -y github:oljodev\/mcp-agent-eyes update$/);
  assert.ok(updateInstructions().includes(UPDATE_COMMAND));
  assert.ok(updateHint().includes(UPDATE_COMMAND));
});
