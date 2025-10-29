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

    if (
      !orderId ||
      !amount ||
      !successRedirectUrl ||
      !paylaterMerchantId ||
      !outletId
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const merchant = await prisma.merchant.findFirst({
      where: { paylaterMerchantId },
    });

    if (!merchant) {
      return res.status(404).json({ message: "Unknown merchant" });
    }

    const decryptedApiKey = decrypt(merchant.paylaterApiKey);
    if (!decryptedApiKey) {
      return res.status(400).json({ message: "Merchant BNPL API key missing" });
    }

    const cancelTimeLimit = merchant.cancelTimeLimit || 10;
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
      return res
        .status(502)
        .json({ message: "PayLater API returned no payment link" });
    }

    const encryptedPaymentUrl = encrypt(paymentUrl);

    const customerEmail = email || "unknown@example.com";
    if (customerEmail === "unknown@example.com") {
      console.warn(`⚠️ Warning: No customer email provided for order ${orderId}`);
    }

    const newOrder = await prisma.order.create({
      data: {
        shopifyOrderId: String(orderId),
        paylaterOrderId: paymentId,
        merchant: {
          connect: { id: merchant.id },
        },
        shopifyStatus: "pending",
        paylaterStatus: "pending",
        amount: parsedAmount,
        currency: "QAR",
        paymentLink: encryptedPaymentUrl,
        cancelTimeLimit,
        customerEmail,
        customerName: fullname || null,
        shopDomain,
        warningSent: false,
        createdAt: new Date(),
      },
    });


    console.log(`✅ Order ${orderId} saved in DB`);
    console.log(`🚀 Payment link generated for order ${orderId}`);

    if (email) {
      const plainLink = paymentUrl;
      await sendPayLaterEmail({
        email,
        fullname: fullname || email,
        order: {
          paylaterOrderId: newOrder.paylaterOrderId,
          merchant: merchant.shop,
          date: newOrder.createdAt,
          amount: newOrder.amount,
          currency: newOrder.currency,
          paymentLink: plainLink,
        },
      });
    }

    res.json({
      paymentUrl,
      paylaterOrderId: paymentId,
      message:
        "PayLater order created successfully. Expiry warning and auto-cancel will be handled by cron.",
    });
  } catch (err) {
    console.error("❌ Error creating BNPL order:", err.message);
    res.status(500).json({
      message: "Failed to create PayLater order",
      error: err.response?.data || err.message,
    });
  }
};
