import express from "express";
import crypto from "crypto";
import axios from "axios";
import { prisma } from "../utils/db.js";
import { decrypt } from "../utils/encryption.js";
import { sendCancellationEmail } from "../utils/sendEmail.js";
import { normalizePayLaterStatus } from "../utils/status.js";

const router = express.Router();

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};


const updateShopifyOrderStatus = async (shop, accessToken, orderId, financialStatus) => {
  try {
    await axios.put(
      `https://${shop}/admin/api/2025-10/orders/${orderId}.json`,
      { order: { id: orderId, financial_status: financialStatus } },
      { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
    );
    console.log(`🚀 Shopify order ${orderId} updated: financial_status=${financialStatus}`);
  } catch (err) {
    console.error(`❌ Failed to update Shopify order ${orderId}:`, err.response?.data || err.message);
  }
};

const captureShopifyTransaction = async (shop, accessToken, orderId, amount) => {
  try {
    await axios.post(
      `https://${shop}/admin/api/2025-10/orders/${orderId}/transactions.json`,
      { transaction: { kind: "capture", status: "success", amount } },
      { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
    );
    console.log(`💰 Shopify transaction captured for order ${orderId}`);
  } catch (err) {
    console.error(`❌ Failed to capture Shopify transaction for order ${orderId}:`, err.response?.data || err.message);
  }
};

router.post("/", async (req, res) => {
  try {
    console.log("📩 BNPL Webhook received:", JSON.stringify(req.body, null, 2));

    const { merchantId, orderId, status, timestamp, txHash, signature, comments } = req.body || {};

    if (!merchantId || !orderId || !status || !timestamp || !txHash || !signature) {
      return res.status(400).send("Missing required fields");
    }

    const merchant = await prisma.merchant.findFirst({
      where: { paylaterMerchantId: merchantId },
    });
    if (!merchant) return res.status(404).send("Merchant not found");

    const webhookSecretPlain = decrypt(merchant.webhookSecret);

    const cleanComments = String((comments || "").trim());
    const dataString = `${merchantId}${orderId}${status}${timestamp}${cleanComments}`.toUpperCase();
    const computedTxHash = crypto.createHash("md5").update(dataString).digest("hex");
    const computedSignature = crypto
      .createHmac("sha256", webhookSecretPlain)
      .update(computedTxHash)
      .digest("hex");

    if (!safeEqual(computedTxHash, txHash) || !safeEqual(computedSignature, signature)) {
      console.error("❌ Signature verification failed!");
      return res.status(403).send("Invalid signature");
    }

    let order = await prisma.order.findFirst({
      where: {
        OR: [
          { paylaterOrderId: String(orderId) },
          { shopifyOrderId: String(orderId) },
        ],
        merchantId: merchant.id,
      },
    });

    if (!order) {
      order = await prisma.order.create({
        data: {
          paylaterOrderId: String(orderId),
          merchant: { connect: { id: merchant.id } }, 
          shopifyStatus: "pending",
          paylaterStatus: "pending",
          customerEmail: req.body.customerEmail || req.body.email || "unknown@example.com",
          customerName: req.body.customerName || req.body.fullname || "Customer",
        },
      });

      console.log(`🆕 Created new order record for BNPL order ${orderId}`);
    }

    const nextStatus = normalizePayLaterStatus(status);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paylaterStatus: nextStatus,
        paylaterTransactionId: txHash,
        paylaterPaymentDate: new Date(Number(timestamp)),
        paylaterComments: cleanComments.slice(0, 2000),
      },
    });

    const decryptedAccessToken = decrypt(merchant.accessToken);


    if (nextStatus === "paid" && order.shopifyStatus !== "paid") {
      await captureShopifyTransaction(merchant.shop, decryptedAccessToken, order.shopifyOrderId, order.amount);
      await updateShopifyOrderStatus(merchant.shop, decryptedAccessToken, order.shopifyOrderId, "paid");

      await prisma.order.update({
        where: { id: order.id },
        data: { shopifyStatus: "paid" },
      });

      console.log(`✅ Shopify order ${order.shopifyOrderId} marked as paid via BNPL webhook`);
    }

    else if (nextStatus === "failed") {
      await prisma.order.update({
        where: { id: order.id },
        data: { shopifyStatus: "cancelled" },
      });

      await updateShopifyOrderStatus(merchant.shop, decryptedAccessToken, order.shopifyOrderId, "cancelled");

      if (order.customerEmail) {
        try {
          await sendCancellationEmail({
            email: order.customerEmail,
            fullname: order.customerName,
            order,
          });
          console.log(`✉️ Cancellation email sent for failed BNPL order ${orderId}`);
        } catch (err) {
          console.error(`❌ Failed to send cancellation email for order ${orderId}:`, err.message || err);
        }
      }
    }


    else {
      console.log(`ℹ️ No action required for order ${orderId} with status ${nextStatus}`);
    }

    return res.status(200).send("Webhook processed successfully");
  } catch (err) {
    console.error("❌ BNPL webhook error:", err);
    return res.status(500).send("Processed with internal errors");
  }
});

export default router;
