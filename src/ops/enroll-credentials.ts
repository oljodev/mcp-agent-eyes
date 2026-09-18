/**
 * enroll_credentials — store a profile's credentials in the encrypted vault so
 * future logins can run unattended (source="vault" / source="totp"). The human
 * types every secret (vault passphrase, username, password, optional TOTP seed)
 * into the secure prompt; the AI only triggers the flow and gets back a
 * non-secret summary (profile name, what was stored, vault size).
 */

import { securePrompt } from "../auth/secure-prompt.js";
import { base32Decode } from "../auth/totp.js";
import { vault } from "../auth/vault.js";
import { BrowserToolError } from "../browser/errors.js";
import type { BrowserSession } from "../browser/session.js";
import type {
  EnrollInput,
  EnrollResult,
  VaultProfile,
  VaultSelectors,
} from "../types/auth.js";

export function enrollCredentials(
  session: BrowserSession,
  input: EnrollInput,
): Promise<EnrollResult> {
  return session.core.runExclusive(async () => {
    // Unlock the vault, or create it on first use. Creating shows the
    // double-entry CREATE screen (a typo'd master passphrase would otherwise
    // lock the vault forever); unlocking an existing vault shows one field.
    if (!vault.isUnlocked()) {
      const creating = !(await vault.exists());
      const passphrase = await securePrompt.request({
        kind: "passphrase",
        profile: input.profile,
        confirm: creating,
      });
      await vault.unlock(passphrase);
    }

    const username = await securePrompt.request({
      kind: "username",
      profile: input.profile,
    });
    const password = await securePrompt.request({
      kind: "password",
      profile: input.profile,
    });

    let totpSecret: string | undefined;
    if (input.withTotp) {
      const seed = (
        await securePrompt.request({
          kind: "secret",
          profile: input.profile,
          label: `TOTP setup key (base32) for "${input.profile}"`,
        })
      )
        .replace(/\s+/g, "")
        .toUpperCase();
      try {
        base32Decode(seed);
      } catch {
        throw new BrowserToolError(
          "That TOTP setup key is not valid base32 — copy the \"setup key\" / " +
            "\"secret\" the site shows when you add an authenticator, not the QR image.",
        );
      }
      totpSecret = seed;
    }

    const selectors = collectSelectors(input);
    const profile: VaultProfile = { username, password };
    if (input.loginUrl) profile.loginUrl = input.loginUrl;
    if (totpSecret) profile.totpSecret = totpSecret;
    if (selectors) profile.selectors = selectors;

    // sessions/ + vault.json are gitignored together by ensureGitignore.
    await session.store.ensureGitignore();
    await vault.enroll(input.profile, profile);

    return {
      profile: input.profile,
      hasTotp: Boolean(totpSecret),
      hasLoginUrl: Boolean(input.loginUrl),
      storedSelectors: selectors ? Object.keys(selectors) : [],
      count: vault.list().length,
      health: await session.core.drainHealth(),
    };
  });
}

function collectSelectors(input: EnrollInput): VaultSelectors | undefined {
  const selectors: VaultSelectors = {};
  if (input.usernameSelector) selectors.username = input.usernameSelector;
  if (input.passwordSelector) selectors.password = input.passwordSelector;
  if (input.submitSelector) selectors.submit = input.submitSelector;
  if (input.otpSelector) selectors.otp = input.otpSelector;
  return Object.keys(selectors).length > 0 ? selectors : undefined;
}
