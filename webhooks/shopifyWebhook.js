import express from "express";
import crypto from "crypto";
import { prisma, connectDb } from "../utils/db.js";
import ensurePayLaterLink from "../utils/ensurePayLaterLinks.js";
import { sendCancellationEmail } from "../utils/sendEmail.js";
import { normalizeShopifyStatus } from "../utils/status.js";
import { verifyShopifyWebhook } from "../utils/verifyShopifyWebhook.js";

const router = express.Router();

router.post("/", verifyShopifyWebhook, async (req, res) => {
  const shopDomain = req.headers["x-shopify-shop-domain"];
  const topic = req.headers["x-shopify-topic"];

  if (!shopDomain || !topic) return res.status(200).send("Ignored: Missing headers");

  await connectDb();

  const merchant = await prisma.merchant.findFirst({ where: { shop: shopDomain } });
  if (!merchant) return res.status(200).send("Ignored: Merchant not found");

  const payload = req.body;

  try {
    const shopifyOrderId = String(payload?.id);
    if (!shopifyOrderId) return res.status(200).send("Ignored: Missing order ID");

    let order = await prisma.order.findFirst({
      where: { shopifyOrderId, merchantId: merchant.id },
    });

    switch (topic) {
      case "orders/create":
      case "checkouts/create": {
        const totalStr = payload?.current_total_price ?? payload?.total_price ?? payload?.total_price_set?.shop_money?.amount;
        if (!totalStr) return res.status(200).send("Ignored: Missing total price");

        const amountNumber = Number(totalStr);
        if (!Number.isFinite(amountNumber) || amountNumber <= 0) return res.status(200).send("Ignored: Invalid amount");

        const gateways = [...(payload?.payment_gateway_names || []), payload?.gateway || ""].map(g => String(g).toLowerCase());
        const isPayLater = gateways.some(g => g.includes("paylater"));
        if (!isPayLater) return res.status(200).send("Not a PayLater order");

        const customerEmail = payload?.email || payload?.customer?.email || payload?.contact_email || null;
        const customerName = payload?.customer?.first_name && payload?.customer?.last_name
          ? `${payload.customer.first_name} ${payload.customer.last_name}`
          : payload?.billing_address?.name || payload?.shipping_address?.name || null;

        if (!order) {
          const { paymentUrl, paylaterOrderId } = await ensurePayLaterLink({
            shopifyOrderId,
            amountNumber,
            customerEmail,
            customerName,
            merchant,
          });

          if (paymentUrl && paylaterOrderId) {
            order = await prisma.order.create({
              data: {
                id: crypto.randomUUID(),
                shopifyOrderId,
                paylaterOrderId,
                merchant: { connect: { id: merchant.id } },
                amount: amountNumber,
                currency: "QAR",
                paymentLink: paymentUrl,
                customerEmail,
                customerName,
                shopDomain: merchant.shop,
                accessToken: merchant.accessToken,
                cancelTimeLimit: merchant.cancelTimeLimit ?? 10,
                shopifyStatus: "pending",
                paylaterStatus: "pending",
                warningSent: false,
                halfTimeReminderSent: false,
                cancelEmailSent: false,
                cancelled: false,
                lastWebhookAt: new Date(),
                lastWebhookId: crypto.randomUUID(),
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            });
            console.log(`✅ PayLater link created for order ${shopifyOrderId}: ${paymentUrl}`);
          } else {
            console.error(`❌ Failed to create PayLater link for ${shopifyOrderId}`);
          }
        } else {
          console.log(`🔁 PayLater link already exists for order ${shopifyOrderId}`);
        }
        break;
      }

      case "orders/paid":
      case "orders/updated": {
        const normalizedStatus = normalizeShopifyStatus(payload?.financial_status);

        if (order) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              shopifyStatus: normalizedStatus,
              lastWebhookAt: new Date(),
              lastWebhookId: crypto.randomUUID(),
              updatedAt: new Date(),
            },
          });

          if (normalizedStatus === "cancelled" && order.paylaterStatus !== "failed") {
            await prisma.order.update({ where: { id: order.id }, data: { paylaterStatus: "failed" } });

            if (order.customerEmail) {
              try {
                await sendCancellationEmail({
                  email: order.customerEmail,
                  fullname: order.customerName || order.customerEmail,
                  order,
                });
                console.log(`✉️ Cancellation email sent for Shopify order ${shopifyOrderId}`);
              } catch (err) {
                console.error(`❌ Failed to send cancellation email for order ${shopifyOrderId}:`, err.message || err);
              }
            }
          }
          console.log(`✅ Shopify payment status updated for ${shopifyOrderId}: ${normalizedStatus}`);
        } else {
          console.log(`ℹ️ Order ${shopifyOrderId} not found for status update, skipping`);
        }
        break;
      }

      default:
        console.log(`ℹ️ Ignored Shopify webhook topic: ${topic}`);
    }

    res.status(200).send(`Webhook received: ${topic}`);
  } catch (err) {
    console.error("❌ Shopify webhook processing error:", err);
    res.status(500).send("Processed with internal errors");
  }
});

export default router;
