import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
  throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
}

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
const IV_LENGTH = 12; 
const HMAC_SECRET = process.env.HMAC_SECRET
  ? Buffer.from(process.env.HMAC_SECRET, "hex")
  : null;


export function encrypt(text) {
  if (!text) return text;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(data) {
  if (!data) return data;

  const parts = String(data).split(":");
  if (parts.length !== 3) return data; 

  try {
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
  } catch (err) {
    console.error("⚠️ Decryption failed:", err.message);
    return data; 
  }
}


export function generateHmac(message) {
  if (!HMAC_SECRET) {
    throw new Error("HMAC_SECRET not configured in environment variables");
  }
  return crypto.createHmac("sha256", HMAC_SECRET).update(message).digest("hex");
}

export function verifyHmac(message, signature) {
  if (!HMAC_SECRET || !signature) return false;

  const computed = generateHmac(message);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}
