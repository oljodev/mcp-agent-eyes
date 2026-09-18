import { test } from "node:test";
import assert from "node:assert/strict";

import { performAction } from "../dist/browser/interactions.js";

// performAction is page-only: it drives page.mouse for the pointer_* gestures.
// We hand it a fake Page that records every mouse call + the args, and assert
// the exact Playwright calls (and their order) without a real browser.
function fakePage({ width = 1280, height = 720 } = {}) {
  const calls = [];
  const page = {
    viewportSize: () => ({ width, height }),
    waitForTimeout: async (ms) => calls.push(["waitForTimeout", ms]),
    locator: () => ({ count: async () => 0 }), // for warnIfAmbiguous (never used here)
    mouse: {
      click: async (x, y, opts) => calls.push(["click", x, y, opts]),
      move: async (x, y, opts) => calls.push(["move", x, y, opts]),
      down: async () => calls.push(["down"]),
      up: async () => calls.push(["up"]),
    },
  };
  return { page, calls };
}

test("pointer_click → mouse.click at the coords, default left button", async () => {
  const { page, calls } = fakePage();
  const r = await performAction(page, { action: "pointer_click", x: 591, y: 436 });
  assert.equal(r, null);
  assert.deepEqual(calls, [["click", 591, 436, { button: "left" }]]);
});

test("pointer_click honors an explicit button", async () => {
  const { page, calls } = fakePage();
  await performAction(page, { action: "pointer_click", x: 10, y: 20, button: "right" });
  assert.deepEqual(calls, [["click", 10, 20, { button: "right" }]]);
});

test("pointer_hover → mouse.move then a reflow pause", async () => {
  const { page, calls } = fakePage();
  await performAction(page, { action: "pointer_hover", x: 100, y: 200 });
  assert.equal(calls[0][0], "move");
  assert.deepEqual(calls[0].slice(1, 3), [100, 200]);
  assert.equal(calls[1][0], "waitForTimeout");
});

test("pointer_drag → move, down, move(steps), up in order", async () => {
  const { page, calls } = fakePage();
  await performAction(page, {
    action: "pointer_drag",
    startX: 50,
    startY: 60,
    endX: 300,
    endY: 80,
    steps: 25,
  });
  assert.deepEqual(calls, [
    ["move", 50, 60, undefined],
    ["down"],
    ["move", 300, 80, { steps: 25 }],
    ["up"],
  ]);
});

test("pointer_drag defaults to 10 interpolation steps", async () => {
  const { page, calls } = fakePage();
  await performAction(page, {
    action: "pointer_drag",
    startX: 0,
    startY: 0,
    endX: 100,
    endY: 100,
  });
  const moveTo = calls.find((c) => c[0] === "move" && c[1] === 100);
  assert.deepEqual(moveTo[3], { steps: 10 });
});

test("pointer_click without coordinates throws an actionable error", async () => {
  const { page, calls } = fakePage();
  await assert.rejects(
    () => performAction(page, { action: "pointer_click", x: 10 }),
    /requires numeric .* viewport pixel coordinates/i,
  );
  assert.deepEqual(calls, []); // never touched the mouse
});

test("a point outside the viewport is rejected (would silently miss)", async () => {
  const { page, calls } = fakePage({ width: 800, height: 600 });
  await assert.rejects(
    () => performAction(page, { action: "pointer_click", x: 900, y: 100 }),
    /outside the 800x600 viewport/,
  );
  assert.deepEqual(calls, []);
});

test("pointer_drag with a missing endpoint throws before any mouse call", async () => {
  const { page, calls } = fakePage();
  await assert.rejects(
    () => performAction(page, { action: "pointer_drag", startX: 1, startY: 2, endX: 3 }),
    /requires numeric/i,
  );
  assert.deepEqual(calls, []);
});
