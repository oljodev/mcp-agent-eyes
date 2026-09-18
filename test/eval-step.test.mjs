import { test } from "node:test";
import assert from "node:assert/strict";

import { performAction } from "../dist/browser/interactions.js";

// performAction dispatches the evaluate_script step through evaluateInPage,
// which wraps the snippet as `(async () => { <script> })()` and renders the
// JSON result. We hand it a fake Page whose evaluate() echoes a value, and
// assert the captured outcome shape ({ scriptValue, label }).
function fakePage(evaluateImpl) {
  return {
    locator: () => ({ count: async () => 0 }),
    evaluate: evaluateImpl,
  };
}

test("evaluate_script returns the rendered value + label", async () => {
  const page = fakePage(async (src) => {
    assert.match(src, /\(async \(\) => \{ return document\.title \}\)\(\)/);
    return "Hello";
  });
  const r = await performAction(page, {
    action: "evaluate_script",
    script: "return document.title",
    label: "page-title",
  });
  assert.deepEqual(r, { scriptValue: '"Hello"', label: "page-title" });
});

test("a numeric return is JSON-rendered", async () => {
  const page = fakePage(async () => 3);
  const r = await performAction(page, {
    action: "evaluate_script",
    script: "return document.querySelectorAll('a').length",
    label: "link-count",
  });
  assert.deepEqual(r, { scriptValue: "3", label: "link-count" });
});

test("label is optional (undefined when omitted)", async () => {
  const page = fakePage(async () => true);
  const r = await performAction(page, { action: "evaluate_script", script: "return true" });
  assert.equal(r.label, undefined);
  assert.equal(r.scriptValue, "true");
});

test("a missing script fails the step before evaluating", async () => {
  let called = false;
  const page = fakePage(async () => {
    called = true;
    return 1;
  });
  await assert.rejects(
    () => performAction(page, { action: "evaluate_script" }),
    /requires a "script"/,
  );
  assert.equal(called, false);
});

test("an in-page throw surfaces as a failing step", async () => {
  const page = fakePage(async () => {
    throw new Error("boom");
  });
  await assert.rejects(
    () => performAction(page, { action: "evaluate_script", script: "throw new Error('boom')" }),
    /evaluate_script failed:.*boom/,
  );
});
