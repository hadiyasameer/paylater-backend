import cron from "node-cron";
import { connectDb } from "../utils/db.js";
import { Order } from "../models/order.js";
import { sendExpiryWarningEmail, sendCancellationEmail } from "../utils/sendEmail.js";
import { decrypt } from "../utils/encryption.js";
import axios from "axios";

connectDb().then(() => console.log("✅ Scheduler connected to MongoDB"));

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    const orders = await Order.find({ paylaterStatus: "pending" }).populate("merchantId");

    await Promise.all(
      orders.map(async (order) => {
        try {
          if (!order.merchantId) return;

          const merchant = order.merchantId;
          const accessToken = decrypt(merchant.accessToken);

          const orderAge = (now - order.createdAt) / 60000; 
          const cancelTimeLimit = merchant.cancelTimeLimit || order.cancelTimeLimit || 10;
          const timeLeft = cancelTimeLimit - orderAge;

          const email = order.customerEmail || order.email || order?.customer?.email || null;
          const fullname = order.customerName || order?.customer?.name || "Customer";

          const halfTime = cancelTimeLimit / 2;

          if (orderAge >= halfTime && !order.halfTimeReminderSent) {
            console.log(`📧 Sending half-time reminder for order ${order.shopifyOrderId}`);
            await sendExpiryWarningEmail({
              email,
              fullname,
              order,
              cancelTimeLimit: Math.ceil(timeLeft),
            });
            order.halfTimeReminderSent = true; 
            await order.save();
          }

          if (orderAge >= cancelTimeLimit && order.paylaterStatus === "pending") {
            console.log(`⏰ Auto-cancelling order ${order.shopifyOrderId} (after ${cancelTimeLimit} mins)`);

            order.shopifyStatus = "cancelled";
            order.paylaterStatus = "failed";

            if (!order.cancelEmailSent && email) {
              try {
                await sendCancellationEmail({ email, fullname, order });
                console.log(`✉️ Cancellation email sent for order ${order.shopifyOrderId}`);
                order.cancelEmailSent = true;
              } catch (err) {
                console.error(`❌ Failed to send cancellation email for ${order.shopifyOrderId}:`, err.response?.data || err.message);
              }
            }

            await order.save();

            if (merchant.shop && accessToken) {
              try {
                await axios.post(
                  `https://${merchant.shop}/admin/api/2025-10/orders/${order.shopifyOrderId}/cancel.json`,
                  {},
                  {
                    headers: {
                      "X-Shopify-Access-Token": accessToken,
                      "Content-Type": "application/json",
                    },
                  }
                );
                console.log(`🛒 Shopify order ${order.shopifyOrderId} cancelled successfully.`);
              } catch (err) {
                console.error(`❌ Failed to cancel Shopify order ${order.shopifyOrderId}:`, err.response?.data || err.message);
              }
            }
          }
        } catch (err) {
          console.error(`❌ Error processing order ${order.shopifyOrderId}:`, err);
        }
      })
    );
  } catch (err) {
    console.error("❌ Scheduler error:", err.message);
  }
});
