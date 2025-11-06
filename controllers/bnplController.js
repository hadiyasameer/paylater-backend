import axios from "axios";
import { prisma, connectDb } from "../utils/db.js";
import { sendPayLaterEmail } from "../utils/sendEmail.js";
import { encrypt, decrypt } from "../utils/encryption.js";

export const createBnplOrder = async (req, res) => {
  try {
    await connectDb();

    const {
      orderId,
      amount,
      successRedirectUrl,
      paylaterMerchantId,
      outletId,
      email,
      fullname,
      shopDomain,
    } = req.body;

    if (!orderId || !amount || !successRedirectUrl || !paylaterMerchantId || !outletId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const merchant = await prisma.merchant.findFirst({
      where: { paylaterMerchantId },
    });

    if (!merchant) {
      return res.status(404).json({ message: "Unknown merchant" });
    }

    const decryptedApiKey = decrypt(merchant.paylaterApiKey);
    const decryptedAccessToken = merchant.accessToken ? decrypt(merchant.accessToken) : null;
    const shopDomainValue = shopDomain || merchant.shop;

    if (!decryptedApiKey) {
      return res.status(400).json({ message: "Merchant BNPL API key missing" });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const existingOrder = await prisma.order.findFirst({
      where: {
        shopifyOrderId: String(orderId),
        merchantId: merchant.id,
      },
    });

    if (existingOrder) {
      return res.json({
        paymentUrl: decrypt(existingOrder.paymentLink),
        paylaterOrderId: existingOrder.paylaterOrderId,
        message: "Order already exists",
      });
    }

    const failRedirectUrl = `${process.env.SERVER_URL}/api/paylater/cancel?orderId=${orderId}`;
    const payload = {
      merchantId: paylaterMerchantId,
      merchant: merchant.shop,
      outletId,
      currency: "QAR",
      amount: parsedAmount,
      orderId: String(orderId),
      successRedirectUrl,
      failRedirectUrl,
    };

    console.log("👉 Sending PayLater request:", payload);

    const response = await axios.post(
      `${process.env.BNPL_BASE_URL}/api/paylater/merchant-portal/web-checkout/`,
      payload,
      {
        headers: {
          "x-api-key": decryptedApiKey,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const paymentUrl = response.data?.paymentLinkUrl;
    const paymentId = response.data?.paylaterRef || orderId;

    if (!paymentUrl) {
      return res.status(502).json({ message: "PayLater API returned no payment link" });
    }

    const encryptedPaymentUrl = encrypt(paymentUrl);
    const customerEmail = email || "unknown@example.com";

    const newOrder = await prisma.order.create({
      data: {
        shopifyOrderId: String(orderId),
        paylaterOrderId: paymentId,
        merchantId: merchant.id,
        shopifyStatus: "pending",
        paylaterStatus: "pending",
        amount: parsedAmount,
        currency: "QAR",
        paymentLink: encryptedPaymentUrl,
        cancelTimeLimit: merchant.cancelTimeLimit || 10,
        customerEmail,
        customerName: fullname || null,
        shopDomain: shopDomainValue,
        accessToken: decryptedAccessToken,
        warningSent: false,
        halfTimeReminderSent: false,
        cancelEmailSent: false,
        cancelled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Order ${orderId} saved in DB`);

    if (email) {
      await sendPayLaterEmail({
        email,
        fullname: fullname || email,
        order: {
          paylaterOrderId: newOrder.paylaterOrderId,
          merchantname: merchant.shop,
          date: newOrder.createdAt,
          amount: newOrder.amount,
          currency: newOrder.currency,
          paymentlink: paymentUrl,
        },
      });
      console.log(`✉️ PayLater email sent to ${email} for order ${orderId}`);
    }

    if (decryptedAccessToken && shopDomainValue) {
      try {
        const { data } = await axios.get(
          `https://${shopDomainValue}/admin/api/2025-10/orders/${orderId}.json`,
          { headers: { "X-Shopify-Access-Token": decryptedAccessToken } }
        );

        const shopifyOrder = data?.order;
        const currentTags = shopifyOrder?.tags || "";
        const newTags = currentTags.includes("PayLater")
          ? currentTags
          : currentTags
            ? `${currentTags}, PayLater`
            : "PayLater";

        const noteContent = `PayLater Payment Link: ${paymentUrl}`;

        await axios.put(
          `https://${shopDomainValue}/admin/api/2025-10/orders/${orderId}.json`,
          { order: { id: orderId, tags: newTags, note: noteContent } },
          { headers: { "X-Shopify-Access-Token": decryptedAccessToken } }
        );

        console.log(`✅ Shopify tags and note updated for order ${orderId}`);
      } catch (shopErr) {
        console.error("⚠️ Failed to update Shopify order:", shopErr.response?.data || shopErr.message);
      }
    }

    res.json({
      paymentUrl,
      paylaterOrderId: paymentId,
      message:
        "PayLater order created successfully. Shopify tags and note updated. Expiry warning and auto-cancel will be handled by cron.",
    });
  } catch (err) {
    console.error("❌ Error creating BNPL order:", err.message);
    res.status(500).json({
      message: "Failed to create PayLater order",
      error: err.response?.data || err.message,
    });
  }
};
