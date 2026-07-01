import crypto from "node:crypto";
import { env } from "../config/env";

const ALGO = "aes-256-gcm";
const key = crypto.createHash("sha256").update(env.JWT_SECRET).digest();

/**
 * サーバー内部の一時的な機密データ（2FA仮トークンに載せるSupabaseセッション等）を
 * 暗号化してオペーク文字列にする。DBに保存せず、有効期限はペイロード内に含めて検証する。
 */
export function encryptPayload(payload: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(json), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

export function decryptPayload<T>(token: string): T {
  const raw = Buffer.from(token, "base64url");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

// totp_secret をDBに保存する際の暗号化（平文保存禁止）
export function encryptSecret(plain: string): string {
  return encryptPayload({ s: plain });
}

export function decryptSecret(token: string): string {
  return decryptPayload<{ s: string }>(token).s;
}
