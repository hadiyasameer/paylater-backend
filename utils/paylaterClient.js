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
  console.error("❌ All PayLater API retries failed, fallback triggered", payload);
  throw lastError;
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
  const merchant = await prisma.merchant.findFirst({
    where: { paylaterMerchantId },
  });
  if (!merchant) throw new Error("Unknown merchant");

  const decryptedAccessToken = decrypt(merchant.accessToken);
  const decryptedApiKey = merchant.paylaterApiKey
    ? decrypt(merchant.paylaterApiKey)
    : process.env.BNPL_API_KEY;
  const xApiKey = decryptedApiKey;

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0)
    throw new Error("Invalid amount");

  let order = await prisma.order.findFirst({
    where: {
      shopifyOrderId: String(shopifyOrderId),
      merchantId: merchant.id,
    },
  });

  if (order) {
    console.log(`🔁 Existing PayLater link reused for order ${shopifyOrderId}`);
    return {
      paymentUrl: decrypt(order.paymentLink),
      paylaterOrderId: order.paylaterOrderId,
    };
  }

  const uniqueOrderId = String(shopifyOrderId);
  const payload = {
    merchantId: paylaterMerchantId,
    outletId,
    currency: "QAR",
    amount: parsedAmount,
    orderId: uniqueOrderId,
    successRedirectUrl,
    failRedirectUrl,
  };

  console.log("👉 Sending PayLater request:", payload);

  let responseData;
  try {
    responseData = await sendPayLaterRequest(payload, 3, xApiKey);
  } catch (err) {
    console.error("❌ Failed to create PayLater order after retries:", err.message);
    throw err;
  }

  const paymentUrl = responseData.paymentLinkUrl;
  const paylaterRef = responseData.paylaterRef || uniqueOrderId;
  if (!paymentUrl) throw new Error("PayLater API returned no payment link");

  order = await prisma.order.create({
    data: {
      shopifyOrderId: uniqueOrderId,
      paylaterOrderId: paylaterRef,
      merchant: {
        connect: { id: merchant.id },
      },
      shopifyStatus: "pending",
      paylaterStatus: "pending",
      amount: parsedAmount,
      currency: "QAR",
      paymentLink: encrypt(paymentUrl),
      customerEmail,
      customerName,
    },
  });

  console.log(`✅ PayLater order saved in DB for Shopify order ${shopifyOrderId}`);

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
      console.log(`✉️ PayLater email sent to ${customerEmail} for order ${shopifyOrderId}`);
    } catch (err) {
      console.error("❌ Failed to send PayLater email:", err.message);
    }
  }

  try {
    const shop = merchant.shop;
    const accessToken = decryptedAccessToken;

    try {
      const shopResp = await axios.get(`https://${shop}/admin/api/2025-10/shop.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
      });
      if (!shopResp?.data?.shop?.id) {
        console.warn(`⚠️ Invalid Shopify access token for ${shop}, skipping tagging.`);
        return { paymentUrl, paylaterOrderId: paylaterRef };
      }
    } catch (verifyErr) {
      console.warn(
        `⚠️ Failed to verify Shopify token for ${shop}:`,
        verifyErr.response?.data || verifyErr.message
      );
      return { paymentUrl, paylaterOrderId: paylaterRef };
    }

    const { data } = await axios.get(
      `https://${shop}/admin/api/2025-10/orders/${shopifyOrderId}.json`,
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );

    const shopifyOrder = data?.order;
    const currentTags = shopifyOrder?.tags || "";
    const newTags = currentTags.includes("PayLater")
      ? currentTags
      : currentTags
        ? `${currentTags}, PayLater`
        : "PayLater";

    if (newTags !== currentTags) {
      await axios.put(
        `https://${shop}/admin/api/2025-10/orders/${shopifyOrderId}.json`,
        { order: { id: shopifyOrderId, tags: newTags } },
        { headers: { "X-Shopify-Access-Token": accessToken } }
      );
      console.log(`✅ Shopify tag 'PayLater' added for order ${shopifyOrderId}`);
    }
  } catch (tagErr) {
    console.error("⚠️ Failed to add PayLater tag:", tagErr.response?.data || tagErr.message);
  }

  return { paymentUrl, paylaterOrderId: paylaterRef };
}
