import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateCheck } from "../dist/ops/verify-eval.js";

const VW = 390; // mobile viewport width
const at = (x, width, height = 20, fontSizePx = 16) => ({ found: true, rect: { x, width, height }, fontSizePx });

test("noViewportOverflow: right edge within the viewport passes", () => {
  const r = evaluateCheck({ selector: "#h", assert: "noViewportOverflow" }, at(0, 300), VW);
  assert.equal(r.ok, true);
});

test("noViewportOverflow: an element wider than the viewport fails (the hero bug)", () => {
  const r = evaluateCheck({ selector: "#h", assert: "noViewportOverflow" }, at(0, 2000), VW);
  assert.equal(r.ok, false);
  assert.match(r.measured, /2000/);
  assert.match(r.expected, /390/);
});

test("minTapTarget: default 44 — 48x48 passes, 20x20 fails", () => {
  assert.equal(evaluateCheck({ selector: "#b", assert: "minTapTarget" }, at(0, 48, 48), VW).ok, true);
  assert.equal(evaluateCheck({ selector: "#b", assert: "minTapTarget" }, at(0, 20, 20), VW).ok, false);
});

test("minTapTarget: custom px threshold honored", () => {
  assert.equal(evaluateCheck({ selector: "#b", assert: "minTapTarget", px: 24 }, at(0, 24, 24), VW).ok, true);
  assert.equal(evaluateCheck({ selector: "#b", assert: "minTapTarget", px: 60 }, at(0, 48, 48), VW).ok, false);
});

test("fontSizeAtMost / fontSizeAtLeast compare the computed size", () => {
  assert.equal(evaluateCheck({ selector: "#h", assert: "fontSizeAtMost", px: 32 }, at(0, 100, 40, 30), VW).ok, true);
  assert.equal(evaluateCheck({ selector: "#h", assert: "fontSizeAtMost", px: 32 }, at(0, 100, 40, 60), VW).ok, false);
  assert.equal(evaluateCheck({ selector: "#h", assert: "fontSizeAtLeast", px: 20 }, at(0, 100, 40, 30), VW).ok, true);
  assert.equal(evaluateCheck({ selector: "#h", assert: "fontSizeAtLeast", px: 20 }, at(0, 100, 40, 16), VW).ok, false);
});

test("fontSize asserts without a px threshold fail closed", () => {
  const r = evaluateCheck({ selector: "#h", assert: "fontSizeAtMost" }, at(0, 100, 40, 30), VW);
  assert.equal(r.ok, false);
});

test("exists / notExists reflect element presence", () => {
  assert.equal(evaluateCheck({ selector: "#h", assert: "exists" }, { found: true, rect: { x: 0, width: 1, height: 1 } }, VW).ok, true);
  assert.equal(evaluateCheck({ selector: "#h", assert: "exists" }, { found: false }, VW).ok, false);
  assert.equal(evaluateCheck({ selector: "#h", assert: "notExists" }, { found: false }, VW).ok, true);
  assert.equal(evaluateCheck({ selector: "#h", assert: "notExists" }, { found: true, rect: { x: 0, width: 1, height: 1 } }, VW).ok, false);
});

test("a measurable assert on a missing element fails (not silently passes)", () => {
  const r = evaluateCheck({ selector: "#gone", assert: "noViewportOverflow" }, { found: false }, VW);
  assert.equal(r.ok, false);
  assert.match(r.measured, /not found/);
});

test("sub-pixel tolerance: 390.4 right edge still passes a 390 viewport", () => {
  const r = evaluateCheck({ selector: "#h", assert: "noViewportOverflow" }, { found: true, rect: { x: 0.4, width: 390 } }, VW);
  assert.equal(r.ok, true);
});
