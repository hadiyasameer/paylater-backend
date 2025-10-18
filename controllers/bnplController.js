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

    let existingOrder = await Order.findOne({ shopifyOrderId: String(orderId), merchantId: merchant._id });
    if (existingOrder) {
      return res.json({
        paymentUrl: existingOrder.paymentLink,
        paylaterOrderId: existingOrder.paylaterOrderId,
        message: "Order already exists"
      });
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
        timeout: 10000
      }
    );

    const paymentUrl = response.data?.paymentLinkUrl;
    if (!paymentUrl) return res.status(502).json({ message: "PayLater API returned no payment link" });

    const newOrder = new Order({
      shopifyOrderId: String(orderId),
      paylaterOrderId: uniqueOrderId,
      merchantId: merchant._id,
      status: "pending",
      amount: parsedAmount,
      currency: "QAR",
      paymentLink: paymentUrl
    });

    await newOrder.save();

    console.log(`✅ Order ${orderId} saved in DB`);
    console.log(`🚀 Payment link generated for order ${orderId}: ${paymentUrl}`);

    res.json({ paymentUrl, paylaterOrderId: uniqueOrderId, message: "PayLater order created successfully" });

  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error("❌ Error creating BNPL order:", errorMsg);

    if (err.code === 11000) { 
      const existingLink = await Order.findOne({ shopifyOrderId: String(req.body.orderId), merchantId: req.body.paylaterMerchantId });
      return res.json({
        paymentUrl: existingLink?.paymentLink,
        message: "Order already exists (duplicate prevented)"
      });
    }

    res.status(500).json({ message: "Failed to create PayLater order", error: err.response?.data || err.message });
  }
};
