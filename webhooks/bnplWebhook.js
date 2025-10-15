import express from "express";
import crypto from "crypto";
import { connectDb } from "../utils/db.js";
import { Merchant } from "../models/merchant.js";
import { Order } from "../models/order.js";

const router = express.Router();

const safeEqual = (a, b) => {
  const ba = Buffer.from(a || "", "utf8");
  const bb = Buffer.from(b || "", "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

router.post("/", async (req, res) => {
  await connectDb();
  const { merchantId, orderId, status, timestamp, txHash, signature, comments } = req.body;

  if (!merchantId || !orderId || !status || !timestamp || !txHash || !signature) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const now = Date.now();
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > 5 * 60 * 1000) {
    return res.status(403).send("Stale or invalid timestamp");
  }

  const merchant = await Merchant.findOne({ paylaterMerchantId: merchantId });
  if (!merchant) return res.status(404).send("Merchant not found");

  const dataString = `${merchantId}${orderId}${status}${timestamp}${comments || ""}`.toUpperCase();
  const computedTxHash = crypto.createHash("md5").update(dataString).digest("hex");
  if (!safeEqual(computedTxHash, txHash)) return res.status(403).send("Invalid txHash");

  const computedSignature = crypto.createHmac("sha256", merchant.webhookSecret).update(txHash).digest("hex");
  if (!safeEqual(computedSignature, signature)) return res.status(403).send("Invalid signature");

  const order = await Order.findOne({ paylaterOrderId: orderId, merchantId: merchant._id });
  if (!order) return res.status(404).send("Order not found");

  const s = String(status).toLowerCase();
  order.status = (s === "success" || s === "paid") ? "paid" : (s === "failed" ? "failed" : order.status);
  await order.save();

  console.log(`✅ Order ${orderId} marked as ${order.status} in DB`);
  res.status(200).send("Webhook processed successfully");
});

export default router;
