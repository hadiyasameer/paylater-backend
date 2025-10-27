import cron from "node-cron";
import { connectDb } from "../utils/db.js";
import { Order } from "../models/order.js";
import { sendExpiryWarningEmail, sendCancellationEmail } from "../utils/sendEmail.js";

connectDb().then(() => console.log("✅ Scheduler connected to MongoDB"));

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    const orders = await Order.find({ paylaterStatus: "pending" }).populate("merchantId");

    for (const order of orders) {
      try {
        if (!order.merchantId) continue;

        const merchant = order.merchantId;
        const orderAge = (now - order.createdAt) / 60000; 
        const cancelTimeLimit = merchant.cancelTimeLimit || order.cancelTimeLimit || 10;
        const halfTime = cancelTimeLimit / 2;
        const timeLeft = Math.ceil(cancelTimeLimit - orderAge);

        const email = order.customerEmail || order?.customer?.email || null;
        const fullname = order.customerName || order?.customer?.name || "Customer";

        if (!order.halfTimeReminderSent && orderAge >= halfTime && orderAge < cancelTimeLimit) {
          order.halfTimeReminderSent = true;
          await order.save();

          if (email) {
            try {
              await sendExpiryWarningEmail({ email, fullname, order, cancelTimeLimit: timeLeft });
              console.log(`✅ Half-time reminder sent for order ${order.shopifyOrderId}`);
            } catch (err) {
              console.error(`❌ Failed to send half-time reminder for ${order.shopifyOrderId}:`, err.message);
            }
          }
        }

        if (!order.cancelled && orderAge >= cancelTimeLimit && order.paylaterStatus === "pending") {
          console.log(`⏰ Auto-cancelling order ${order.shopifyOrderId} (after ${cancelTimeLimit} mins)`);

          await order.autoCancel(merchant);

          if (!order.cancelEmailSent && email) {
            try {
              await sendCancellationEmail({ email, fullname, order });
              order.cancelEmailSent = true;
              await order.save();
              console.log(`✉️ Cancellation email sent for order ${order.shopifyOrderId}`);
            } catch (err) {
              console.error(`❌ Failed to send cancellation email for ${order.shopifyOrderId}:`, err.message);
            }
          }
        }

      } catch (err) {
        console.error(`❌ Error processing order ${order.shopifyOrderId}:`, err.message);
      }
    }

    console.log("🔔 Scheduler run complete");
  } catch (err) {
    console.error("❌ Scheduler error:", err.message);
  }
});
