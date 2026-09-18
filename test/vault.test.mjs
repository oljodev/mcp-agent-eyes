import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { vault } from "../dist/auth/vault.js";

const origCwd = process.cwd();
let root;

before(() => {
  root = mkdtempSync(join(tmpdir(), "ae-vault-"));
  process.chdir(root);
});
after(() => {
  vault.lock();
  process.chdir(origCwd);
  rmSync(root, { recursive: true, force: true });
});

test("enroll → encrypt → lock → unlock → decrypt round-trips the secret", async () => {
  await vault.unlock("correct-horse-battery-staple"); // creates a fresh vault
  await vault.enroll("acct", { username: "carol@example.com", password: "T0pS3cret", totpSecret: "JBSWY3DPEHPK3PXP" });
  assert.ok(vault.isUnlocked());
  assert.deepEqual(vault.list(), ["acct"]);

  // On-disk blob must be ciphertext — no plaintext secret leaks.
  const raw = readFileSync(join(root, ".agent-eyes", "vault.json"), "utf8");
  for (const secret of ["carol@example.com", "T0pS3cret", "JBSWY3DPEHPK3PXP"]) {
    assert.equal(raw.includes(secret), false, `plaintext leaked: ${secret}`);
  }
  const json = JSON.parse(raw);
  assert.ok(json.ciphertext && json.iv && json.authTag && json.salt, "AES-GCM envelope present");

  vault.lock();
  assert.equal(vault.isUnlocked(), false);

  await vault.unlock("correct-horse-battery-staple"); // reload from disk
  assert.equal(vault.get("acct").password, "T0pS3cret");
  assert.equal(vault.get("acct").totpSecret, "JBSWY3DPEHPK3PXP");
});

test("a wrong passphrase fails (GCM auth) and does not unlock", async () => {
  vault.lock();
  await assert.rejects(() => vault.unlock("the-wrong-passphrase"), /incorrect|corrupt/i);
  assert.equal(vault.isUnlocked(), false);
});

test("the correct passphrase still unlocks after a wrong attempt", async () => {
  await vault.unlock("correct-horse-battery-staple");
  assert.equal(vault.get("acct").username, "carol@example.com");
});
