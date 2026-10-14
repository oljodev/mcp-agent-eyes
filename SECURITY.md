# Security policy

## Reporting a vulnerability

Please report security issues **privately**, not in a public issue.

- Preferred: [GitHub private vulnerability reporting](https://github.com/oljodev/mcp-agent-eyes/security/advisories/new)
- Or email: olav@jodal.no

Include what you did, what happened, and what you expected. I aim to acknowledge
within a few days. Please give me a reasonable window to ship a fix before
disclosing publicly.

Supported: the current `main` branch, which is what `npx github:oljodev/mcp-agent-eyes`
installs. Fixes land there rather than as patches to older tags.

## What agent-eyes touches on your machine

Worth knowing before you run it, and worth stating plainly for anyone reviewing
the code:

- **A real Chrome with a persistent profile.** Managed mode (the default)
  launches Chrome against `~/.agent-eyes/chrome-profile`. Anything you log into
  there stays logged in, and any page the agent opens runs with those cookies.
  Point `browser.profileDir` somewhere else to keep it separate from work you
  care about.
- **A loopback prompt on localhost.** Human handoffs open a short-lived page
  bound to `127.0.0.1` with Done / Cancel buttons. It carries no secrets.
- **No network allow-list.** The agent can point the browser at any http(s)
  URL it can reach, including private ranges and cloud-metadata addresses
  (`169.254.169.254`). Run it where that is acceptable.
- **Screenshots on disk.** Full-resolution captures are saved under
  `.agent-eyes/captures/`, which is auto-gitignored. They can contain whatever
  was on screen, including authenticated pages.
- **Arbitrary in-page JavaScript, opt-in.** The standalone `evaluate_script`
  tool is exposed only when `AGENT_EYES_ALLOW_EVAL=1`.

## Scope and stance

agent-eyes drives a real browser so that ordinary logins and bot-protected pages
behave normally. It **does not solve CAPTCHAs and does not bypass anti-bot
protection.** When a page needs a human, `await_human_interaction` hands the
window to you and blocks — your click is what validates, not the agent's.

Pull requests that add CAPTCHA solving, anti-bot evasion, or credential
handling will be declined.
