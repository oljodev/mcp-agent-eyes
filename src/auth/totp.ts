/**
 * RFC 6238 TOTP, implemented with node:crypto only (no new dependency).
 * Used by the Tier-2 vault so the server can compute a 2FA code from a stored
 * authenticator seed and type it in — fully unattended, still AI-blind (the
 * code is generated server-side, used in one fill(), and never returned).
 */

import { createHmac } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode an RFC 4648 base32 string (authenticator "setup key") to bytes. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const index = BASE32_ALPHABET.indexOf(ch);
    if (index === -1) {
      throw new Error(`Invalid base32 character "${ch}" in TOTP secret.`);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generate a time-based one-time code. Defaults match every common
 * authenticator app (SHA-1, 30s step, 6 digits). The counter is built with a
 * 64-bit big-endian write so it stays correct past 2038.
 */
export function generateTotp(
  base32Secret: string,
  atMs: number = Date.now(),
  step = 30,
  digits = 6,
): string {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(Math.floor(atMs / 1000) / step);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}
