import axios from 'axios';
import { Order } from '../models/order.js';
import { connectDb } from '../utils/db.js';
import { Merchant } from '../models/merchant.js';

export const createBnplOrder = async (req, res) => {
  try {
    await connectDb();

    const { orderId, amount, successRedirectUrl, failRedirectUrl, paylaterMerchantId, outletId } = req.body;

    if (!orderId || !amount || !successRedirectUrl || !failRedirectUrl || !paylaterMerchantId || !outletId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const merchant = await Merchant.findOne({ paylaterMerchantId });
    if (!merchant) return res.status(404).json({ message: "Unknown merchant" });

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const existingOrder = await Order.findOne({ shopifyOrderId: String(orderId), merchantId: merchant._id });
    if (existingOrder) {
      console.log(`ℹ️ Order ${orderId} already exists, returning existing payment link.`);
      return res.json({ paymentUrl: existingOrder.paymentLink, message: "Order already exists" });
    }

    const uniqueOrderId = `${orderId}-${Date.now()}`;

    const payload = {
      merchantId: paylaterMerchantId,
      outletId,
      currency: "QAR",
      amount: parsedAmount,
      orderId: uniqueOrderId,
      successRedirectUrl,
      failRedirectUrl
    };

    console.log("👉 Sending PayLater request:", payload);

    const response = await axios.post(
      `${process.env.BNPL_BASE_URL}/api/paylater/merchant-portal/web-checkout/`,
      payload,
      {
        headers: {
          'x-api-key': process.env.BNPL_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 12000
      }
    );

    const paymentUrl = response.data?.paymentLinkUrl;
    if (!paymentUrl) return res.status(502).json({ message: "PayLater API returned no payment link" });

    await new Order({
      shopifyOrderId: String(orderId),
      paylaterOrderId: uniqueOrderId,
      merchantId: merchant._id,
      status: "pending",
      amount: parsedAmount,
      currency: "QAR",
      paymentLink: paymentUrl
    }).save();

    console.log(`✅ Order ${orderId} saved in DB`);
    return res.json({ paymentUrl, message: "PayLater order created successfully" });

  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error("❌ Error creating BNPL order:", errorMsg);

    if (errorMsg?.includes("Order ID already exists")) {
      const existingLink = err.response?.data?.paymentLinkUrl;
      return res.json({
        paymentUrl: existingLink || `${req.body.successRedirectUrl}?orderId=${req.body.orderId}`,
        message: "Order already exists"
      });
    }

    return res.status(500).json({ message: "Failed to create PayLater order", error: err.response?.data || err.message });
  }
};
