/**
 * RFC 6238 time-based one-time codes, for logging in as the CI
 * two-factor user without an authenticator app.
 */

import { createHmac } from "node:crypto";

/**
 * The CI two-factor user's secret: RFC 4226's published test key,
 * "12345678901234567890", in Base32. Matches `CI_TOTP_SECRET` in
 * `backend/scripts/seed_ci.py`.
 */
// cspell:disable-next-line
export const CI_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

// The RFC 4648 Base32 alphabet, not a credential
// eslint-disable-next-line no-secrets/no-secrets
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new Error(`Not Base32: ${char}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** The six-digit code for `secret` at `time` (default now), 30 s steps. */
export function totpCode(secret: string, time: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, "0");
}
