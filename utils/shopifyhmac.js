import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

// Timing-safe comparison to prevent timing attacks
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

export const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!hmacHeader) return res.status(401).send("Missing HMAC header");
  if (!req.rawBody) return res.status(400).send("Raw body missing");

  // Compute HMAC from raw request body
  const hash = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody, "utf8")
    .digest("base64");

  // Compare HMAC securely
  if (!safeEqual(hash, hmacHeader)) {
    return res.status(401).send("Invalid HMAC");
  }

  console.log("✅ Shopify HMAC verified successfully");
  next();
};
