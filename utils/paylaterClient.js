import axios from "axios";
import { prisma } from "./db.js";
import { sendPayLaterEmail } from "./sendEmail.js";
import { encrypt, decrypt } from "./encryption.js";

const bnplApi = axios.create({
  baseURL: process.env.BNPL_BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

async function sendPayLaterRequest(payload, retries = 3, xApiKey) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await bnplApi.post(
        "/api/paylater/merchant-portal/web-checkout/",
        payload,
        { headers: { "x-api-key": xApiKey } }
      );
      if (!response.data?.paymentLinkUrl)
        throw new Error("No payment link returned");
      return response.data;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ PayLater request attempt ${attempt} failed:`, err.message);
      if (attempt < retries)
        await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }
  console.error("❌ All PayLater API retries failed", payload);
  throw lastError;
}

async function updateShopifyOrder(shopDomain, accessToken, orderId, tags = [], note) {
  try {
    const { data } = await axios.get(
      `https://${shopDomain}/admin/api/2025-10/orders/${orderId}.json`,
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );

    const existingTags = data?.order?.tags || "";
    const mergedTags = Array.from(
      new Set([...existingTags.split(",").map((t) => t.trim()).filter(Boolean), ...tags])
    ).join(", ");

    await axios.put(
      `https://${shopDomain}/admin/api/2025-10/orders/${orderId}.json`,
      { order: { id: orderId, tags: mergedTags, note } },
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );

    console.log(`✅ Shopify order updated for order ${orderId} (tags + note)`);
  } catch (err) {
    console.error(`⚠️ Failed to update Shopify order ${orderId}:`, err.response?.data || err.message);
  }
}

export async function createPayLaterOrder({
  shopifyOrderId,
  amount,
  successRedirectUrl,
  failRedirectUrl,
  paylaterMerchantId,
  outletId,
  customerEmail = null,
  customerName = null,
}) {
  const merchant = await prisma.merchant.findFirst({ where: { paylaterMerchantId } });
  if (!merchant) throw new Error("Unknown merchant");

  const decryptedAccessToken = decrypt(merchant.accessToken);
  const xApiKey = merchant.paylaterApiKey ? decrypt(merchant.paylaterApiKey) : process.env.BNPL_API_KEY;

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error("Invalid amount");

  let order = await prisma.order.findFirst({
    where: { shopifyOrderId: String(shopifyOrderId), merchantId: merchant.id },
  });

  if (order) {
    console.log(`🔁 Reusing existing PayLater link for order ${shopifyOrderId}`);
    return { paymentUrl: decrypt(order.paymentLink), paylaterOrderId: order.paylaterOrderId };
  }

  const payload = {
    merchantId: paylaterMerchantId,
    outletId,
    currency: "QAR",
    amount: parsedAmount,
    orderId: String(shopifyOrderId),
    successRedirectUrl,
    failRedirectUrl,
  };

  console.log("👉 Sending PayLater request:", payload);

  const responseData = await sendPayLaterRequest(payload, 3, xApiKey);
  const paymentUrl = responseData.paymentLinkUrl;
  const paylaterRef = responseData.paylaterRef || String(shopifyOrderId);

  if (!paymentUrl) throw new Error("PayLater API returned no payment link");

  order = await prisma.order.create({
    data: {
      shopifyOrderId: String(shopifyOrderId),
      paylaterOrderId: paylaterRef,
      merchant: { connect: { id: merchant.id } },
      shopifyStatus: "pending",
      paylaterStatus: "pending",
      amount: parsedAmount,
      currency: "QAR",
      paymentLink: encrypt(paymentUrl),
      customerEmail,
      customerName,
    },
  });

  console.log(`✅ PayLater order saved for Shopify order ${shopifyOrderId}`);

  if (customerEmail) {
    try {
      await sendPayLaterEmail({
        email: customerEmail,
        fullname: customerName || customerEmail,
        order: {
          paylaterOrderId: paylaterRef,
          merchant: merchant.shop,
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Qatar" }),
          amount: parsedAmount,
          currency: "QAR",
          paymentLink: paymentUrl,
        },
      });
      console.log(`✉️ PayLater email sent to ${customerEmail}`);
    } catch (err) {
      console.error("❌ Failed to send PayLater email:", err.message);
    }
  }

  if (decryptedAccessToken) {
    const shopDomain = merchant.shop;
    const noteContent = `PayLater Payment Link: ${paymentUrl}`;
    await updateShopifyOrder(shopDomain, decryptedAccessToken, shopifyOrderId, ["PayLater", "PaymentLinkSent"], noteContent);
  }

  return { paymentUrl, paylaterOrderId: paylaterRef };
}
