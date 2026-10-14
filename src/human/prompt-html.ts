/**
 * The handoff prompt's presentation layer: one light-theme page with Done /
 * Cancel buttons. Pure string-building with no state; the dynamic instruction
 * is HTML-escaped at the boundary.
 */

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
  ".explain{font-size:13px;line-height:1.55;margin:0 0 18px}" +
  ".explain b{font-weight:600}button{margin-top:8px;width:100%;padding:10px;" +
  "font-size:14px;font-weight:600;border:0;border-radius:8px;background:#1f883d;" +
  "color:#fff;cursor:pointer}button:hover{background:#1a7f37}" +
  ".secondary{background:#f6f8fa;color:#24292f;border:1px solid #d0d7de}" +
  ".secondary:hover{background:#eef1f4}.actions{display:flex;gap:10px}";

export function htmlScreen(nonce: string, message: string | undefined): string {
  const instruction = message
    ? escapeHtml(message)
    : "complete the pending step in the browser window";
  return (
    "<!doctype html><meta charset=utf-8>" +
    '<meta name=viewport content="width=device-width,initial-scale=1">' +
    "<title>agent-eyes handoff</title>" +
    `<style>${PAGE_STYLE}</style>` +
    `<main><form method=post action="/p/${nonce}">` +
    '<div class=brand><span class=dot></span>agent-eyes</div>' +
    "<h1>Your turn in the browser</h1>" +
    "<p class=explain>The agent has paused and needs YOU to act in the " +
    `agent-eyes browser window: <b>${instruction}</b> Switch to that window, ` +
    "do it, then click Done below. The AI does not see or solve this step " +
    "itself — it only waits for you to finish.</p>" +
    "<div class=actions>" +
    "<button name=v value=continue>Done</button>" +
    "<button class=secondary name=v value=cancel>Cancel</button>" +
    "</div></form></main>"
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
  "This prompt has expired or was already used. Re-run the tool to get a new one.";
