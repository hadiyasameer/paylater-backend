import express from "express";
import { prisma, connectDb } from "../utils/db.js";
import ensurePayLaterLink from "../utils/ensurePayLaterLinks.js";
import { sendCancellationEmail } from "../utils/sendEmail.js";
import { normalizeShopifyStatus } from "../utils/status.js";
import { verifyShopifyWebhook } from "../utils/shopifyhmac.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const shopDomain = req.headers["x-shopify-shop-domain"];
  const topic = req.headers["x-shopify-topic"];

  if (!shopDomain || !topic) return res.status(200).send("Ignored: Missing headers");

  await connectDb();

  const merchant = await prisma.merchant.findFirst({ where: { shop: shopDomain } });
  if (!merchant) return res.status(200).send("Ignored: Merchant not found");

  const payload = req.body;

  try {
    switch (topic) {

      case "orders/create":
      case "checkouts/create": {
        const shopifyOrderId = payload?.id;
        const totalStr =
          payload?.current_total_price ??
          payload?.total_price ??
          payload?.total_price_set?.shop_money?.amount;

        if (!shopifyOrderId || !totalStr)
          return res.status(200).send("Ignored: Missing order ID or total price");

        const amountNumber = Number(totalStr);
        if (!Number.isFinite(amountNumber) || amountNumber <= 0)
          return res.status(200).send("Ignored: Invalid amount");

        const gateways = [
          ...(payload?.payment_gateway_names || []),
          payload?.gateway || "",
        ].map((g) => String(g).toLowerCase());
        const isPayLater = gateways.some((g) => g.includes("paylater"));
        if (!isPayLater) return res.status(200).send("Not a PayLater order");

        const customerEmail =
          payload?.email ||
          payload?.customer?.email ||
          payload?.contact_email ||
          null;

        const customerName =
          payload?.customer?.first_name && payload?.customer?.last_name
            ? `${payload.customer.first_name} ${payload.customer.last_name}`
            : payload?.billing_address?.name ||
            payload?.shipping_address?.name ||
            null;

        let existingOrder = await prisma.order.findFirst({
          where: {
            shopifyOrderId: String(shopifyOrderId),
            merchantId: merchant.id,
          },
        });

        if (!existingOrder) {
          try {
            const { paymentUrl, paylaterOrderId } = await ensurePayLaterLink({
              shopifyOrderId,
              amountNumber,
              customerEmail,
              customerName,
              merchant,
            });

            if (paymentUrl && paylaterOrderId) {
              existingOrder = await prisma.order.create({
                data: {
                  shopifyOrderId: String(shopifyOrderId),
                  paylaterOrderId,
                  merchant: { connect: { id: merchant.id } }, 
                  amount: amountNumber,
                  customerEmail,
                  customerName,
                  currency: "QAR",
                  shopifyStatus: "pending",
                  paylaterStatus: "pending",
                  paymentLink: paymentUrl,
                },
              });


              console.log(`✅ PayLater link created for order ${shopifyOrderId}: ${paymentUrl}`);
            } else {
              console.error(`❌ Failed to create PayLater link for ${shopifyOrderId}`);
            }
          } catch (err) {
            console.error("❌ Async PayLater creation error:", err);
          }
        } else {
          console.log(`🔁 PayLater link already exists for order ${shopifyOrderId}, skipping creation`);
        }

        res.status(200).send(`Webhook received: ${topic}`);
        break;
      }


      case "orders/paid":
      case "orders/updated": {
        const shopifyOrderId = payload?.id;
        if (!shopifyOrderId) return res.status(200).send("Ignored: Missing order ID");

        const order = await prisma.order.findFirst({
          where: {
            shopifyOrderId: String(shopifyOrderId),
            merchantId: merchant.id,
          },
        });
        if (!order) return res.status(200).send("Order not found, ignoring");

        const normalizedStatus = normalizeShopifyStatus(payload?.financial_status);

        await prisma.order.update({
          where: { id: order.id },
          data: { shopifyStatus: normalizedStatus },
        });

        if (normalizedStatus === "cancelled" && order.paylaterStatus !== "failed") {
          await prisma.order.update({
            where: { id: order.id },
            data: { paylaterStatus: "failed" },
          });

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
        res.status(200).send(`Webhook received: ${topic}`);
        break;
      }

      default:
        console.log(`ℹ️ Ignored Shopify webhook topic: ${topic}`);
        res.status(200).send("Ignored topic");
    }
  } catch (err) {
    console.error("❌ Shopify webhook processing error:", err);
    res.status(500).send("Processed with internal errors");
  }
});

export default router;
