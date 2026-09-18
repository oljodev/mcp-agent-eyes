/**
 * The secure-prompt presentation layer: the light-theme page chrome and the
 * per-kind, plain-language copy a first-timer reads before typing a secret (or
 * approving a sign-in / handoff). Split out of secure-prompt.ts so the transport
 * + lifecycle logic there stays focused; this module is pure string-building
 * with no state. Any dynamic value (the site/profile, the handoff instruction)
 * is HTML-escaped here at the boundary.
 */

import type { PromptKind } from "./types.js";

/** The subset of a pending prompt the renderer needs (Pending satisfies this). */
export interface PromptView {
  kind: PromptKind;
  profile: string | undefined;
  message: string | undefined;
  confirm: boolean;
  minLength: number;
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c,
  );
}

const PAGE_STYLE =
  'body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,' +
  "system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:" +
  "center;background:#f6f8fa;color:#1f2328}" +
  "main{width:100%;max-width:360px;box-sizing:border-box;padding:32px 28px;" +
  "background:#fff;border:1px solid #d0d7de;border-radius:14px;" +
  "box-shadow:0 1px 3px rgba(31,35,40,.06),0 10px 28px rgba(31,35,40,.05)}" +
  ".brand{display:flex;align-items:center;gap:8px;font-weight:600;" +
  "font-size:13px;margin:0 0 18px}.dot{width:9px;height:9px;border-radius:50%;" +
  "background:#2da44e}h1{font-size:17px;margin:0 0 8px;font-weight:600}" +
  ".explain{color:#1f2328;font-size:13px;line-height:1.55;margin:0 0 18px}" +
  ".explain b{font-weight:600}.field{margin:0 0 12px}label{display:block;" +
  "font-size:12px;font-weight:600;margin:0 0 6px}input{width:100%;" +
  "box-sizing:border-box;padding:10px 12px;font-size:15px;border-radius:8px;" +
  "border:1px solid #d0d7de;background:#fff;color:#1f2328}input:focus{" +
  "outline:0;border-color:#0969da;box-shadow:0 0 0 3px rgba(9,105,218,.25)}" +
  "button{margin-top:8px;width:100%;padding:10px;font-size:14px;" +
  "font-weight:600;border:0;border-radius:8px;background:#1f883d;color:#fff;" +
  "cursor:pointer}button:hover{background:#1a7f37}" +
  ".secondary{background:#f6f8fa;color:#24292f;border:1px solid #d0d7de}" +
  ".secondary:hover{background:#eef1f4}.actions{display:flex;gap:10px}" +
  ".actions button{margin-top:8px}.hint{font-size:11px;color:#8c959f;" +
  "margin:2px 0 0}.err{background:#ffebe9;border:1px solid rgba(255,129,130,.4);" +
  "color:#cf222e;font-size:12px;padding:8px 10px;border-radius:6px;" +
  "margin:0 0 14px}.note{margin:16px 0 0;font-size:11px;color:#8c959f;" +
  "text-align:center}";

interface Screen {
  h1: string;
  /** Safe HTML — any dynamic part (the site/profile) is pre-escaped here. */
  explain: string;
  fields: Array<{ name: string; label: string; masked: boolean; numeric?: boolean }>;
  consent?: boolean;
  submitLabel: string;
  /** Label for the secondary (Cancel) button on a decision screen. */
  cancelLabel?: string;
  minLengthHint?: string;
}

const NEVER_SEES = "The AI never sees what you type here.";

/** Plain-language, per-kind screen copy so a first-timer knows what to do. */
function copyFor(entry: PromptView): Screen {
  const raw = entry.profile ?? "this site";
  const site = escapeHtml(raw);
  switch (entry.kind) {
    case "consent":
      return {
        h1: `Allow sign-in to ${raw}?`,
        explain: `Claude wants to sign in to <b>${site}</b> on your behalf for this task. Allow it for this session?`,
        fields: [],
        consent: true,
        submitLabel: "Continue",
      };
    case "handoff": {
      const instruction = entry.message
        ? escapeHtml(entry.message)
        : "complete the pending step in the browser window";
      return {
        h1: "Your turn in the browser",
        explain:
          "The agent has paused and needs YOU to act in the agent-eyes browser " +
          `window: <b>${instruction}</b> Switch to that window, do it, then click ` +
          "Done below. The AI does not see or solve this step itself — it only " +
          "waits for you to finish.",
        fields: [],
        consent: true,
        submitLabel: "Done",
        cancelLabel: "Cancel",
      };
    }
    case "reset_confirm":
      return {
        h1: "Delete all saved logins?",
        explain:
          "This permanently erases the encrypted vault on this computer — " +
          "every saved login is removed and you start fresh. This cannot be " +
          "undone. Type <b>RESET</b> below to confirm.",
        fields: [{ name: "v", label: "Type RESET to confirm", masked: false }],
        submitLabel: "Delete vault",
      };
    case "passphrase":
      return entry.confirm
        ? {
            h1: "Create a master passphrase",
            explain:
              "This is the master password that encrypts your saved logins on " +
              `THIS computer. You'll need it to unlock them later. ${NEVER_SEES} ` +
              "It protects the saved file if it ever leaks — it does not hide " +
              "anything from the AI. <b>You cannot recover your saved logins if " +
              "you forget it.</b>",
            fields: [
              { name: "v", label: "Passphrase", masked: true },
              { name: "v2", label: "Confirm passphrase", masked: true },
            ],
            minLengthHint: `Use at least ${entry.minLength} characters you'll remember.`,
            submitLabel: "Create vault",
          }
        : {
            h1: "Unlock your saved logins",
            explain:
              "This is the master password that encrypts your saved logins on " +
              `THIS computer. Enter it to unlock them. ${NEVER_SEES}`,
            fields: [{ name: "v", label: "Vault passphrase", masked: true }],
            submitLabel: "Unlock",
          };
    case "username":
      return {
        h1: `Sign in to ${raw}`,
        explain: `You're signing in to <b>${site}</b>. Type your email or username — it goes straight to the site. ${NEVER_SEES}`,
        fields: [{ name: "v", label: "Email / username", masked: false }],
        submitLabel: "Continue",
      };
    case "password":
      return {
        h1: `Sign in to ${raw}`,
        explain: `You're signing in to <b>${site}</b>. Type your password — it goes straight to the site. ${NEVER_SEES}`,
        fields: [{ name: "v", label: "Password", masked: true }],
        submitLabel: "Sign in",
      };
    case "otp":
      return {
        h1: "Two-factor code",
        explain: `Enter the current one-time code for <b>${site}</b> (from your authenticator app or SMS). ${NEVER_SEES}`,
        fields: [{ name: "v", label: "One-time code", masked: false, numeric: true }],
        submitLabel: "Verify",
      };
    default:
      return {
        h1: "Authenticator setup key",
        explain: `Paste the authenticator <b>setup key</b> for <b>${site}</b> — the letters/numbers the site shows when adding a 2FA app. It is stored encrypted, and the AI never sees it.`,
        fields: [{ name: "v", label: "Setup key", masked: false }],
        submitLabel: "Save",
      };
  }
}

export function htmlScreen(nonce: string, entry: PromptView, error?: string): string {
  const screen = copyFor(entry);
  const errHtml = error ? `<div class=err>${escapeHtml(error)}</div>` : "";
  let body: string;
  if (screen.consent) {
    body =
      "<div class=actions>" +
      `<button name=v value=continue>${escapeHtml(screen.submitLabel)}</button>` +
      `<button class=secondary name=v value=cancel>${escapeHtml(screen.cancelLabel ?? "Cancel")}</button>` +
      "</div>";
  } else {
    const fields = screen.fields
      .map((f, i) => {
        const focus = i === 0 ? "autofocus " : "";
        return (
          `<div class=field><label for=${f.name}>${f.label}</label>` +
          `<input id=${f.name} name=${f.name} type=${f.masked ? "password" : "text"} ` +
          `autocomplete=off ${focus}spellcheck=false autocapitalize=off` +
          `${f.numeric ? " inputmode=numeric" : ""}></div>`
        );
      })
      .join("");
    const hint = screen.minLengthHint
      ? `<p class=hint>${escapeHtml(screen.minLengthHint)}</p>`
      : "";
    body = `${fields}${hint}<button>${escapeHtml(screen.submitLabel)}</button>`;
  }
  return (
    "<!doctype html><meta charset=utf-8>" +
    '<meta name=viewport content="width=device-width,initial-scale=1">' +
    "<title>agent-eyes secure input</title>" +
    `<style>${PAGE_STYLE}</style>` +
    `<main><form method=post action="/p/${nonce}" autocomplete=off>` +
    '<div class=brand><span class=dot></span>agent-eyes</div>' +
    `<h1>${escapeHtml(screen.h1)}</h1>` +
    errHtml +
    `<p class=explain>${screen.explain}</p>` +
    body +
    '<p class=note>Sent only to your local agent-eyes — the AI never sees this.</p>' +
    "</form></main>"
  );
}

export function htmlNotice(message: string): string {
  return (
    "<!doctype html><meta charset=utf-8><title>agent-eyes</title>" +
    `<style>${PAGE_STYLE}</style><main>` +
    '<div class=brand><span class=dot></span>agent-eyes</div>' +
    `<p style="margin:0">${escapeHtml(message)}</p></main>`
  );
}

export const RECEIVED = "✓ Received — you can close this tab and return to your agent.";
export const EXPIRED =
  "This secure prompt has expired or was already used. Re-run the tool to get a new one.";
