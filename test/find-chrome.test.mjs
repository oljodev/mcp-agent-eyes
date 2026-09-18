import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { findChromeBinary } from "../dist/browser/find-chrome.js";

test("explicit existing path is returned as-is", () => {
  // process.execPath (the node binary) is guaranteed to exist.
  assert.equal(findChromeBinary(process.execPath), process.execPath);
});

test("explicit missing path throws a clear, actionable error", () => {
  assert.throws(
    () => findChromeBinary("/definitely/not/a/real/chrome"),
    (err) => /does not exist/i.test(err.message) && /chromePath/.test(err.message),
  );
});

test("auto-detect returns an existing executable or throws cleanly", () => {
  // Environment-dependent: either it finds a real Chrome (must exist) or it
  // throws a message naming the setting and the probed paths — never undefined.
  try {
    const found = findChromeBinary(null);
    assert.equal(typeof found, "string");
    assert.ok(existsSync(found), `auto-detected path should exist: ${found}`);
  } catch (err) {
    assert.match(err.message, /chromePath|Chrome/);
  }
});
