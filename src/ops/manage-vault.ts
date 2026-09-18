/**
 * manage_vault — make the encrypted credential vault recoverable: report its
 * status, RESET (delete) it when a passphrase is forgotten, or CHANGE the
 * passphrase (re-encrypt every profile). Destructive actions are gated by a
 * secure-prompt confirmation the human completes; the AI only triggers them
 * and gets back a non-secret summary.
 */

import { consent } from "../auth/consent.js";
import { securePrompt } from "../auth/secure-prompt.js";
import { vault } from "../auth/vault.js";
import { BrowserToolError } from "../browser/errors.js";
import type { BrowserSession } from "../browser/session.js";
import type { ManageVaultInput, ManageVaultResult, VaultAction } from "../types/auth.js";

const VAULT_LABEL = "the credential vault";

export function manageVault(
  session: BrowserSession,
  input: ManageVaultInput,
): Promise<ManageVaultResult> {
  return session.core.runExclusive(async () => {
    switch (input.action) {
      case "status": {
        const exists = await vault.exists();
        const summary = !exists
          ? "No vault yet. Run enroll_credentials to create one."
          : vault.isUnlocked()
            ? `Vault unlocked — ${vault.list().length} profile(s): ` +
              `${vault.list().join(", ") || "(none)"}.`
            : "Vault exists but is locked. It unlocks the next time you log in " +
              "with source=vault or enroll (you'll enter the passphrase then).";
        return build(session, "status", summary);
      }
      case "reset": {
        if (!(await vault.exists())) {
          throw new BrowserToolError("There is no vault to reset.");
        }
        const confirmed = await securePrompt.request({
          kind: "reset_confirm",
          profile: VAULT_LABEL,
        });
        if (confirmed !== "RESET") {
          throw new BrowserToolError("Vault reset was not confirmed.");
        }
        await vault.deleteVault();
        consent.clear();
        return build(
          session,
          "reset",
          "Vault deleted. Run enroll_credentials to create a new one from scratch.",
        );
      }
      case "change_passphrase": {
        if (!(await vault.exists())) {
          throw new BrowserToolError(
            "No vault exists yet — create one with enroll_credentials.",
          );
        }
        if (!vault.isUnlocked()) {
          const current = await securePrompt.request({
            kind: "passphrase",
            profile: VAULT_LABEL,
          });
          await vault.unlock(current); // throws on a wrong passphrase
        }
        const next = await securePrompt.request({
          kind: "passphrase",
          profile: VAULT_LABEL,
          confirm: true,
        });
        await vault.rekey(next);
        return build(
          session,
          "change_passphrase",
          `Passphrase changed; ${vault.list().length} profile(s) re-encrypted. ` +
            "The old passphrase no longer works.",
        );
      }
    }
  });
}

async function build(
  session: BrowserSession,
  action: VaultAction,
  summary: string,
): Promise<ManageVaultResult> {
  return {
    action,
    exists: await vault.exists(),
    unlocked: vault.isUnlocked(),
    profiles: vault.list(),
    summary,
    health: await session.core.drainHealth(),
  };
}
