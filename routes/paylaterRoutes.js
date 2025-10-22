import express from "express";
import { Order } from "../models/order.js";
import { Merchant } from "../models/merchant.js";
import { connectDb } from "../utils/db.js";
import { sendCancellationEmail } from "../utils/sendEmail.js";
import { decrypt } from "../utils/encryption.js";
import axios from "axios";

const router = express.Router();

router.get("/cancel", async (req, res) => {
  try {
    await connectDb();
    const { orderId } = req.query;

    if (!orderId) return res.status(400).send("Missing order ID");

    const order = await Order.findOne({ shopifyOrderId: orderId }).populate("merchantId");
    if (!order) return res.status(404).send("Order not found");

    const merchant = order.merchantId;
    if (!merchant) return res.status(404).send("Merchant not found");

    let accessToken;
    try {
      accessToken = decrypt(merchant.accessToken);
    } catch (err) {
      console.error("❌ Failed to decrypt merchant access token:", err.message);
      return res.status(500).send("Merchant access token unavailable");
    }

    if (order.shopifyStatus === "cancelled" || order.paylaterStatus === "failed") {
      console.log(`⚠️ Order ${orderId} already cancelled, skipping`);
      return res.redirect(`${process.env.FRONTEND_URL}/payment-cancelled`);
    }

    order.shopifyStatus = "cancelled";
    order.paylaterStatus = "failed";
    await order.save();
    console.log(`✅ Order ${orderId} updated in DB as cancelled`);

    if (merchant.shop && accessToken) {
      try {
        const response = await axios.post(
          `https://${merchant.shop}/admin/api/2025-10/orders/${orderId}/cancel.json`,
          {},
          {
            headers: {
              "X-Shopify-Access-Token": accessToken,
              "Content-Type": "application/json",
            },
          }
        );
        console.log(`🛒 Shopify order ${orderId} cancelled successfully:`, response.data);
      } catch (err) {
        console.error(`❌ Failed to cancel Shopify order ${orderId}:`, err.response?.data || err.message);
      }
    }

    if (order.customerEmail) {
      try {
        await sendCancellationEmail({
          email: order.customerEmail,
          fullname: order.customerName || order.customerEmail,
          order,
        });
        console.log(`✉️ Cancellation email sent to ${order.customerEmail}`);
      } catch (err) {
        console.error(`❌ Failed to send cancellation email for ${orderId}:`, err);
      }
    } else {
      console.warn(`⚠️ No customer email for order ${orderId}, skipping email`);
    }

    res.redirect(`${process.env.FRONTEND_URL}/payment-cancelled`);
  } catch (error) {
    console.error("❌ Error handling cancellation:", error.message);
    res.status(500).send("Failed to cancel order");
  }
});

export default router;
