import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

export const verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!hmacHeader) {
    return res.status(401).send("Missing HMAC header");
  }
  if (!req.rawBody) {
    return res.status(400).send("Raw body missing");
  }

  // Compute HMAC
  const hash = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody, "utf8")
    .digest("base64");

  // Compare HMAC
  if (hash !== hmacHeader) {
    if (!safeEqual(hash, hmacHeader)) {
      return res.status(401).send("Invalid HMAC");
    }
  }

  next();
};
