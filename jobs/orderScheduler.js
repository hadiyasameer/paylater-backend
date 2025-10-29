import cron from "node-cron";
import { connectDb, prisma } from "../utils/db.js";
import { sendExpiryWarningEmail, sendCancellationEmail } from "../utils/sendEmail.js";
import { decrypt } from "../utils/encryption.js";
import axios from "axios";

connectDb().then(() => console.log("✅ Scheduler connected to PostgreSQL"));

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    const orders = await prisma.order.findMany({
      where: { paylaterStatus: "pending" },
      include: { merchant: true }, 
    });

    for (const order of orders) {
      try {
        const merchant = order.merchant;
        if (!merchant) continue;

        const orderAge = (now - order.createdAt) / 60000; 
        const cancelTimeLimit = merchant.cancelTimeLimit || order.cancelTimeLimit || 10;
        const halfTime = cancelTimeLimit / 2;
        const timeLeft = Math.ceil(cancelTimeLimit - orderAge);

        const email = order.customerEmail || null;
        const fullname = order.customerName || "Customer";

        if (!order.halfTimeReminderSent && orderAge >= halfTime && orderAge < cancelTimeLimit) {
          await prisma.order.update({
            where: { id: order.id },
            data: { halfTimeReminderSent: true },
          });

          if (email) {
            try {
              await sendExpiryWarningEmail({
                email,
                fullname,
                order,
                cancelTimeLimit: timeLeft,
              });
              console.log(`✅ Half-time reminder sent for order ${order.shopifyOrderId}`);
            } catch (err) {
              console.error(
                `❌ Failed to send half-time reminder for ${order.shopifyOrderId}:`,
                err.message
              );
            }
          }
        }

        if (!order.cancelled && orderAge >= cancelTimeLimit && order.paylaterStatus === "pending") {
          console.log(`⏰ Auto-cancelling order ${order.shopifyOrderId} (after ${cancelTimeLimit} mins)`);

          const shop = merchant.shopDomain || merchant.shop;
          const accessToken = decrypt(merchant.accessToken);
          const updateData = {
            cancelled: true,
            shopifyStatus: "cancelled",
            paylaterStatus: "failed",
            cancelEmailSent: true,
          };

          await prisma.order.update({
            where: { id: order.id },
            data: updateData,
          });

          if (shop && accessToken && order.shopifyOrderId) {
            try {
              await axios.post(
                `https://${shop}/admin/api/2025-10/orders/${order.shopifyOrderId}/cancel.json`,
                { transaction: { kind: "void", status: "success" } },
                {
                  headers: {
                    "X-Shopify-Access-Token": accessToken,
                    "Content-Type": "application/json",
                  },
                  timeout: 10000,
                }
              );
              console.log(`🛑 Shopify order ${order.shopifyOrderId} cancelled successfully.`);
            } catch (err) {
              console.error(
                `❌ Failed to auto-cancel Shopify order ${order.shopifyOrderId}:`,
                err.response?.data || err.message
              );
            }
          }

          if (email) {
            try {
              await sendCancellationEmail({ email, fullname, order });
              console.log(`✉️ Cancellation email sent for order ${order.shopifyOrderId}`);
            } catch (err) {
              console.error(
                `❌ Failed to send cancellation email for ${order.shopifyOrderId}:`,
                err.message
              );
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
