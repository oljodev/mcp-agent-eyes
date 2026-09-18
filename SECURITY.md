# Security policy

## Reporting a vulnerability

Please report security issues **privately**, not in a public issue.

- Preferred: [GitHub private vulnerability reporting](https://github.com/oljodev/mcp-agent-eyes/security/advisories/new)
- Or email: olav@jodal.no

Include what you did, what happened, and what you expected. I aim to acknowledge
within a few days. Please give me a reasonable window to ship a fix before
disclosing publicly.

Supported: the latest published version on npm. Fixes go out as a new release
rather than as patches to older versions.

## What agent-eyes touches on your machine

Worth knowing before you run it, and worth stating plainly for anyone reviewing
the code:

- **A real Chrome with a persistent profile.** Managed mode (the default)
  launches Chrome against `~/.agent-eyes/chrome-profile`. Anything you log into
  there stays logged in, and any page the agent opens runs with those cookies.
  Point `browser.profileDir` somewhere else to keep it separate from work you
  care about.
- **An encrypted credential vault.** `enroll_credentials` writes
  `.agent-eyes/vault.json`: AES-256-GCM, key derived with scrypt from a master
  passphrase that is held in memory only and never written to disk. There is no
  plaintext-vault mode. The file is auto-gitignored.
- **A loopback prompt on localhost.** Logins and human handoffs open a
  short-lived page bound to `127.0.0.1` for you to type into. Credentials go
  from that page into the target site — never into an MCP tool argument, a tool
  result, or a log.
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
harvesting will be declined.
