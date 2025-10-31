import { createPayLaterOrder } from "./paylaterClient.js";
import { prisma, connectDb } from "./db.js";
import crypto from "crypto";

export default async function ensurePayLaterLink({
  shopifyOrderId,
  amountNumber,
  customerEmail,
  customerName,
  merchant,
}) {
  await connectDb();

  try {
    const now = new Date();
    const webhookId = crypto.randomUUID();

    const merchantFull = await prisma.merchant.findUnique({
      where: { id: merchant.id },
    });

    if (!merchantFull) {
      console.error(`❌ Merchant not found for ID: ${merchant.id}`);
      return { paymentUrl: null, paylaterOrderId: null };
    }

    const existingOrder = await prisma.order.findFirst({
      where: {
        shopifyOrderId: String(shopifyOrderId),
        merchantId: merchantFull.id,
      },
    });

    if (existingOrder?.paymentLink && existingOrder?.paylaterOrderId) {
      console.log(`🔁 Existing PayLater link reused for Shopify order ${shopifyOrderId}`);
      return {
        paymentUrl: existingOrder.paymentLink,
        paylaterOrderId: existingOrder.paylaterOrderId,
      };
    }

    const failRedirectUrl = `${process.env.SERVER_URL}/api/paylater/cancel?orderId=${shopifyOrderId}`;
    const successRedirectUrl =
      merchantFull.successUrl || `${process.env.FRONTEND_URL}/pages/paylater-success`;

    const result = await createPayLaterOrder({
      shopifyOrderId,
      amount: amountNumber,
      successRedirectUrl,
      failRedirectUrl,
      paylaterMerchantId: merchantFull.paylaterMerchantId,
      outletId: merchantFull.paylaterOutletId,
      customerEmail,
      customerName,
    });

    if (!result.paymentUrl || !result.paylaterOrderId) {
      console.error(`❌ Failed to create PayLater order for Shopify order ${shopifyOrderId}`);
      return { paymentUrl: null, paylaterOrderId: null };
    }

    const order = await prisma.order.upsert({
      where: {
        shopifyOrderId_merchantId: {
          shopifyOrderId: String(shopifyOrderId),
          merchantId: merchantFull.id,
        },
      },
      update: {
        paylaterOrderId: result.paylaterOrderId,
        paymentLink: result.paymentUrl,
        customerEmail: customerEmail || existingOrder?.customerEmail,
        customerName: customerName || existingOrder?.customerName,
        lastWebhookAt: now,
        lastWebhookId: webhookId,
        updatedAt: now,
      },
      create: {
        id: crypto.randomUUID(),
        shopifyOrderId: String(shopifyOrderId),
        paylaterOrderId: result.paylaterOrderId,
        merchant: { connect: { id: merchantFull.id } },
        amount: amountNumber,
        currency: "QAR",
        customerEmail,
        customerName,
        paymentLink: result.paymentUrl,
        shopifyStatus: "pending",
        paylaterStatus: "pending",
        shopDomain: merchantFull.shop,
        accessToken: merchantFull.accessToken,
        cancelTimeLimit: merchantFull.cancelTimeLimit ?? 10,
        warningSent: false,
        halfTimeReminderSent: false,
        cancelEmailSent: false,
        cancelled: false,
        lastWebhookAt: now,
        lastWebhookId: webhookId,
        createdAt: now,
        updatedAt: now,
      },
    });

    if (existingOrder) {
      console.log(`🔄 Updated existing order ${shopifyOrderId} with PayLater info`);
    } else {
      console.log(`🆕 Created new order record for Shopify order ${shopifyOrderId}`);
    }

    return {
      paymentUrl: result.paymentUrl,
      paylaterOrderId: result.paylaterOrderId,
    };
  } catch (err) {
    console.error(`❌ Error creating PayLater link for Shopify order ${shopifyOrderId}:`, err.message);
    return { paymentUrl: null, paylaterOrderId: null };
  }
}
