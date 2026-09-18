/**
 * CredentialVault — the Tier-2 encrypted credential store ("database").
 *
 * A single file, .agent-eyes/vault.json, holds the WHOLE profile map encrypted
 * as one AES-256-GCM blob (so even profile names and login URLs are
 * confidential). The key is derived from a master passphrase via scrypt; the
 * passphrase is entered through the secure prompt and held only as the derived
 * key in memory — never written to disk. There is no plaintext-vault mode:
 * stored passwords + TOTP seeds are far more sensitive than the short-lived
 * session tokens under sessions/, so they are always encrypted at rest.
 *
 * node:crypto only — no new dependency. Honest limit: V8 strings are immutable
 * and GC-controlled, so key zeroization on lock() is best-effort.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { BrowserToolError } from "../browser/errors.js";
import { AGENT_EYES_DIR } from "../types/persistence.js";
import type { VaultProfile } from "../types/auth.js";
import { generateTotp } from "./totp.js";

const VERSION = 1;
const KDF_PARAMS = { N: 16384, r: 8, p: 1, keyLen: 32 } as const;

type VaultData = Record<string, VaultProfile>;

interface VaultFile {
  version: number;
  kdf: "scrypt";
  kdfParams: typeof KDF_PARAMS;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

class CredentialVault {
  private key: Buffer | null = null;
  private salt: Buffer | null = null;
  private data: VaultData | null = null;

  private file(): string {
    return path.resolve(process.cwd(), AGENT_EYES_DIR, "vault.json");
  }

  /** True once a vault.json is present on disk (locked or not). */
  async exists(): Promise<boolean> {
    try {
      await readFile(this.file());
      return true;
    } catch {
      return false;
    }
  }

  isUnlocked(): boolean {
    return this.key !== null && this.data !== null;
  }

  /**
   * Unlock the on-disk vault with the passphrase, or — when no vault exists yet
   * — start a fresh empty one keyed by this passphrase (persisted on the first
   * enroll). A wrong passphrase fails GCM authentication and throws.
   */
  async unlock(passphrase: string): Promise<void> {
    let raw: string | null = null;
    try {
      raw = await readFile(this.file(), "utf8");
    } catch {
      raw = null;
    }

    if (raw === null) {
      this.salt = randomBytes(32);
      this.key = this.deriveKey(passphrase, this.salt);
      this.data = {};
      return;
    }

    let parsed: VaultFile;
    try {
      parsed = JSON.parse(raw) as VaultFile;
    } catch {
      throw new BrowserToolError("Vault file is corrupt (not valid JSON).");
    }
    const salt = Buffer.from(parsed.salt, "base64");
    const key = this.deriveKey(passphrase, salt);
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(parsed.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(parsed.authTag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(parsed.ciphertext, "base64")),
        decipher.final(),
      ]);
      this.data = JSON.parse(plaintext.toString("utf8")) as VaultData;
      this.key = key;
      this.salt = salt;
    } catch {
      // GCM final() throws on a wrong key OR tampered file — never
      // distinguish the two (don't leak whether the passphrase was close).
      throw new BrowserToolError(
        "Vault passphrase is incorrect, or the vault file is corrupt.",
      );
    }
  }

  get(name: string): VaultProfile {
    const data = this.requireUnlocked();
    const profile = data[name];
    if (!profile) {
      throw new BrowserToolError(
        `No vault entry named "${name}". Enroll it first with enroll_credentials.`,
      );
    }
    return profile;
  }

  hasProfile(name: string): boolean {
    return this.data !== null && name in this.data;
  }

  list(): string[] {
    return this.data ? Object.keys(this.data) : [];
  }

  async enroll(name: string, profile: VaultProfile): Promise<void> {
    const data = this.requireUnlocked();
    data[name] = profile;
    await this.save();
  }

  async remove(name: string): Promise<void> {
    const data = this.requireUnlocked();
    delete data[name];
    await this.save();
  }

  /** Current TOTP code for a stored seed. Throws if the entry has none. */
  totp(name: string): string {
    const profile = this.get(name);
    if (!profile.totpSecret) {
      throw new BrowserToolError(
        `Vault entry "${name}" has no stored TOTP seed — use source="prompt" ` +
          "so the human can type the 2FA code instead.",
      );
    }
    return generateTotp(profile.totpSecret);
  }

  /** Drop the key + decrypted data from memory (best-effort zeroization). */
  lock(): void {
    this.key?.fill(0);
    this.key = null;
    this.salt = null;
    this.data = null;
  }

  /** Wipe the vault file entirely (escape hatch for a forgotten passphrase). */
  async deleteVault(): Promise<void> {
    await rm(this.file(), { force: true });
    this.lock();
  }

  /**
   * Re-encrypt the (unlocked) vault under a NEW passphrase: fresh salt + key,
   * same data. The old passphrase no longer unlocks the file afterwards.
   */
  async rekey(newPassphrase: string): Promise<void> {
    this.requireUnlocked();
    this.salt = randomBytes(32);
    this.key = this.deriveKey(newPassphrase, this.salt);
    await this.save();
  }

  private requireUnlocked(): VaultData {
    if (!this.data) {
      throw new BrowserToolError(
        "The credential vault is locked. Run authenticate_login with " +
          "source=vault (or enroll_credentials) to unlock it via the secure prompt.",
      );
    }
    return this.data;
  }

  private deriveKey(passphrase: string, salt: Buffer): Buffer {
    return scryptSync(passphrase, salt, KDF_PARAMS.keyLen, {
      N: KDF_PARAMS.N,
      r: KDF_PARAMS.r,
      p: KDF_PARAMS.p,
    });
  }

  private async save(): Promise<void> {
    if (!this.key || !this.salt || !this.data) {
      throw new BrowserToolError("Cannot save a locked vault.");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(this.data), "utf8")),
      cipher.final(),
    ]);
    const payload: VaultFile = {
      version: VERSION,
      kdf: "scrypt",
      kdfParams: KDF_PARAMS,
      salt: this.salt.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    const file = this.file();
    await mkdir(path.dirname(file), { recursive: true });
    // write-then-rename so a crash never leaves a half-written vault.
    const tmp = `${file}.tmp-${process.pid}`;
    await writeFile(tmp, JSON.stringify(payload));
    await rename(tmp, file);
  }
}

/** The one shared credential vault for this server process. */
export const vault = new CredentialVault();
