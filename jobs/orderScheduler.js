import cron from "node-cron";
import { connectDb } from "../utils/db.js";
import { Order } from "../models/order.js";
import { sendExpiryWarningEmail, sendCancellationEmail } from "../utils/sendEmail.js";

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

          const orderAge = (now - order.createdAt) / 60000;
          const cancelTimeLimit = merchant.cancelTimeLimit || order.cancelTimeLimit || 10;
          const halfTime = cancelTimeLimit / 2;
          const timeLeft = Math.ceil(cancelTimeLimit - orderAge);

          const email = order.customerEmail || order.email || order?.customer?.email || null;
          const fullname = order.customerName || order?.customer?.name || "Customer";

          if (!order.halfTimeReminderSent && orderAge >= halfTime && orderAge < cancelTimeLimit) {
            console.log(`📧 Sending half-time reminder for order ${order.shopifyOrderId}`);
            await sendExpiryWarningEmail({ email, fullname, order, cancelTimeLimit: timeLeft });
            order.halfTimeReminderSent = true;
            await order.save();
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
                console.error(`❌ Failed to send cancellation email for ${order.shopifyOrderId}:`, err.response?.data || err.message);
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
