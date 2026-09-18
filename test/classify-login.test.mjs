import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyLoginStateInPage } from "../dist/inpage/classify-login.js";

// The classifier is an in-page function (reads document/location/getComputedStyle).
// We run it in node behind a minimal fake DOM to test its verdict transitions —
// including the mid-redirect "unknown" case the polling fix depends on.
function el(text = "", shown = true) {
  return { textContent: text, __shown: shown, getBoundingClientRect: () => ({ width: shown ? 100 : 0, height: shown ? 20 : 0 }) };
}

function run({ href, loginUrl, passwords = [], otps = [], errors = [] }) {
  const prev = { l: globalThis.location, d: globalThis.document, g: globalThis.getComputedStyle };
  globalThis.location = { href };
  globalThis.getComputedStyle = (e) => ({ display: e.__shown ? "block" : "none", visibility: "visible", opacity: "1" });
  globalThis.document = {
    querySelectorAll: (sel) => {
      if (sel.includes('type="password"')) return passwords;
      if (sel.includes("one-time-code")) return otps;
      if (sel.includes('role="alert"')) return errors;
      return [];
    },
  };
  try {
    return classifyLoginStateInPage({ loginUrl });
  } finally {
    globalThis.location = prev.l;
    globalThis.document = prev.d;
    globalThis.getComputedStyle = prev.g;
  }
}

test("success: password gone + url changed → none", () => {
  const v = run({ href: "http://x/home", loginUrl: "http://x/login", passwords: [] });
  assert.equal(v.challenge, "none");
  assert.equal(v.passwordFieldGone, true);
  assert.equal(v.urlChanged, true);
});

test("otp challenge: a visible one-time-code field → otp", () => {
  const v = run({ href: "http://x/verify", loginUrl: "http://x/login", passwords: [], otps: [el()] });
  assert.equal(v.challenge, "otp");
  assert.equal(v.otpFieldPresent, true);
});

test("error: rejected submit (password still shown + alert) → error", () => {
  const v = run({ href: "http://x/login", loginUrl: "http://x/login", passwords: [el()], errors: [el("Invalid email or password")] });
  assert.equal(v.challenge, "error");
  assert.match(v.errorText, /Invalid email/);
});

test("mid-redirect: still on login URL, form present, no error → unknown (keep polling)", () => {
  const v = run({ href: "http://x/login", loginUrl: "http://x/login", passwords: [el()] });
  assert.equal(v.challenge, "unknown");
  assert.equal(v.urlChanged, false);
  assert.equal(v.passwordFieldGone, false);
});

test("password gone but URL unchanged (SPA) → unknown, not a false success", () => {
  const v = run({ href: "http://x/login", loginUrl: "http://x/login", passwords: [] });
  assert.equal(v.challenge, "unknown");
  assert.equal(v.passwordFieldGone, true);
  assert.equal(v.urlChanged, false);
});

test("a HIDDEN password field counts as gone (display:none)", () => {
  const v = run({ href: "http://x/home", loginUrl: "http://x/login", passwords: [el("", false)] });
  assert.equal(v.passwordFieldGone, true);
  assert.equal(v.challenge, "none");
});

test("error wins over a stray otp-looking field when password is still visible", () => {
  const v = run({ href: "http://x/login", loginUrl: "http://x/login", passwords: [el()], otps: [el()], errors: [el("Wrong code")] });
  assert.equal(v.challenge, "error");
});
