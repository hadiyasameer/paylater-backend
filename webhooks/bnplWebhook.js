// webhooks/bnplWebhook.js
import express from "express";
import crypto from "crypto";
import axios from "axios";
import dotenv from "dotenv";
import { Merchant } from "../models/merchant.js";
import { connectDb } from "../utils/db.js";

dotenv.config();
const router = express.Router();

router.post("/", async (req, res) => {
  console.log("📩 PayLater Webhook Received:", req.body);
  await connectDb();

  const { merchantId, orderId, status, timestamp, txHash, signature, comments } = req.body;

  if (!merchantId || !orderId || !status || !timestamp || !txHash || !signature) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const merchant = await Merchant.findOne({ paylaterMerchantId: merchantId });
  if (!merchant) {
    console.warn(`No merchant found for ID ${merchantId}`);
    return res.status(404).send("Merchant not found");
  }

  // 1️⃣ Verify txHash
  const dataString = `${merchantId}${orderId}${status}${timestamp}${comments || ""}`.toUpperCase();
  const computedTxHash = crypto.createHash("md5").update(dataString).digest("hex");
  if (computedTxHash !== txHash) {
    console.warn("❌ Invalid txHash");
    return res.status(403).send("Invalid txHash");
  }

  // 2️⃣ Verify Signature
  const computedSignature = crypto
    .createHmac("sha256", merchant.webhookSecret)
    .update(txHash)
    .digest("hex");

  if (computedSignature !== signature) {
    console.warn("❌ Invalid Signature");
    return res.status(403).send("Invalid signature");
  }

  console.log("✅ Webhook verified successfully for order:", orderId);

  // 3️⃣ Update Shopify order if payment succeeded
  if (status === "success" || status === "paid") {
    try {
      const shopifyResponse = await axios.post(
        `https://${process.env.SHOPIFY_STORE}/admin/api/2025-07/orders/${orderId}/transactions.json`,
        {
          transaction: {
            kind: "capture",
            gateway: "PayLater",
            amount: req.body.amount || "0.00",
          },
        },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`🛍 Shopify order ${orderId} marked as paid`);
      console.log(shopifyResponse.data);
    } catch (err) {
      console.error("❌ Shopify update failed:", err.response?.data || err.message);
    }
  }

  res.status(200).send("Webhook processed successfully");
});

export default router;
