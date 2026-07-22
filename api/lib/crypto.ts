import crypto from "crypto";
import { env } from "./env";

const ENCRYPTION_PREFIX = "enc:";
const ALGORITHM = "aes-256-gcm";
const SEPARATOR = ":";

function getKey(): Buffer {
  const secret = env.appSecret;
  if (secret.length >= 64) {
    const buf = Buffer.from(secret, "hex");
    if (buf.length === 32) {
      return buf;
    }
    // Not valid hex or wrong length — fall through to hash
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptApiKey(plain: string | null | undefined): string | null {
  if (!plain) return null;
  if (plain.startsWith(ENCRYPTION_PREFIX)) return plain;

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload = `${iv.toString("base64")}${SEPARATOR}${authTag.toString("base64")}${SEPARATOR}${encrypted.toString("base64")}`;
  return `${ENCRYPTION_PREFIX}${payload}`;
}

export function decryptApiKey(cipherText: string | null | undefined): string | null {
  if (!cipherText) return null;
  if (!cipherText.startsWith(ENCRYPTION_PREFIX)) {
    // Plaintext fallback for legacy keys before encryption was introduced
    return cipherText;
  }

  const payload = cipherText.slice(ENCRYPTION_PREFIX.length);
  const [ivB64, authTagB64, encryptedB64] = payload.split(SEPARATOR);
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    console.error("[crypto] Invalid encrypted key format");
    return null;
  }

  try {
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.error("[crypto] Failed to decrypt API key:", err);
    return null;
  }
}
