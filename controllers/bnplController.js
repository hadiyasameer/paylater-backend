import axios from "axios";
import { Order } from "../models/order.js";
import { connectDb } from "../utils/db.js";
import { Merchant } from "../models/merchant.js";
import { sendPayLaterEmail } from "../utils/sendEmail.js";
import { encrypt } from "../utils/encryption.js";

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
      accessToken
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

    const merchant = await Merchant.findOne({ paylaterMerchantId });
    if (!merchant)
      return res.status(404).json({ message: "Unknown merchant" });

    const cancelTimeLimit = merchant.cancelTimeLimit || 10;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const existingOrder = await Order.findOne({
      shopifyOrderId: String(orderId),
      merchantId: merchant._id
    });

    if (existingOrder) {
      return res.json({
        paymentUrl: existingOrder.toObject().paymentLink,
        paylaterOrderId: existingOrder.paylaterOrderId,
        message: "Order already exists"
      });
    }

    const failRedirectUrl = `${process.env.SERVER_URL}/api/paylater/cancel?orderId=${orderId}`;

    const payload = {
      merchantId: paylaterMerchantId,
      outletId,
      currency: "QAR",
      amount: parsedAmount,
      orderId: String(orderId),
      successRedirectUrl,
      failRedirectUrl
    };

    console.log("👉 Sending PayLater request:", payload);

    const response = await axios.post(
      `${process.env.BNPL_BASE_URL}/api/paylater/merchant-portal/web-checkout/`,
      payload,
      {
        headers: {
          "x-api-key": process.env.BNPL_API_KEY,
          "Content-Type": "application/json"
        },
        timeout: 10000
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

    const newOrder = new Order({
      shopifyOrderId: String(orderId),
      paylaterOrderId: paymentId,
      merchantId: merchant._id,
      merchant:merchant.shop,
      shopifyStatus: "pending",
      paylaterStatus: "pending",
      amount: parsedAmount,
      currency: "QAR",
      paymentLink: encryptedPaymentUrl,
      cancelTimeLimit,
      createdAt: new Date(),
      customerEmail,
      customerName: fullname || null,
      shopDomain,
      accessToken,
      warningSent: false
    });

    await newOrder.save();

    console.log(`✅ Order ${orderId} saved in DB`);
    console.log(`🚀 Payment link generated for order ${orderId}`);


    if (email) {
      const plainLink = newOrder.toObject().paymentLink;
      await sendPayLaterEmail({
        email,
        fullname: fullname || email,
        order: {
          paylaterOrderId: newOrder.paylaterOrderId,
          merchant: merchant.shop,
          date: newOrder.createdAt,
          amount: newOrder.amount,
          currency: newOrder.currency,
          paymentLink: plainLink
        }
      });
    }

    res.json({
      paymentUrl,
      paylaterOrderId: paymentId,
      message:
        "PayLater order created successfully. Expiry warning and auto-cancel will be handled by cron."
    });
  } catch (err) {
    console.error("❌ Error creating BNPL order:", err.message);
    res.status(500).json({
      message: "Failed to create PayLater order",
      error: err.response?.data || err.message
    });
  }
};
