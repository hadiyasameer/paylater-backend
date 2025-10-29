import { createPayLaterOrder } from "./paylaterClient.js";
import { prisma, connectDb } from "./db.js";

export default async function ensurePayLaterLink({
  shopifyOrderId,
  amountNumber,
  customerEmail,
  merchant,
}) {
  await connectDb();

  const order = await prisma.order.findFirst({
    where: {
      shopifyOrderId: String(shopifyOrderId),
      merchantId: merchant.id, 
    },
  });

  if (order?.paymentLink) {
    console.log(`🔁 Existing PayLater link reused for order ${shopifyOrderId}`);
    return {
      paymentUrl: order.paymentLink,
      paylaterOrderId: order.paylaterOrderId,
    };
  }

  try {
    const failRedirectUrl = `${process.env.SERVER_URL}/api/paylater/cancel?orderId=${shopifyOrderId}`;
    const successRedirectUrl =
      merchant.successUrl || `${process.env.FRONTEND_URL}/pages/paylater-success`;

    const result = await createPayLaterOrder({
      shopifyOrderId,
      amount: amountNumber,
      successRedirectUrl,
      failRedirectUrl,
      paylaterMerchantId: merchant.paylaterMerchantId,
      outletId: merchant.paylaterOutletId,
      customerEmail,
    });

    return result;
  } catch (err) {
    console.error(
      `❌ Failed to create PayLater order for ${shopifyOrderId}:`,
      err.message
    );
    return { paymentUrl: null, paylaterOrderId: null };
  }
}
