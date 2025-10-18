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

    let order = await Order.findOne({ shopifyOrderId: String(orderId), merchantId: merchant._id });
    if (order) {
      console.log(`ℹ️ Order ${orderId} already exists`);
      return res.json({ paymentUrl: order.paymentLink, paylaterOrderId: order.paylaterOrderId, message: "Order already exists" });
    }

    const paylaterOrderId = String(orderId);

    const payload = {
      merchantId: paylaterMerchantId,
      outletId,
      currency: "QAR",
      amount: parsedAmount,
      orderId: paylaterOrderId,
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

    order = new Order({
      shopifyOrderId: String(orderId),
      paylaterOrderId,
      merchantId: merchant._id,
      shopifyStatus: 'pending',
      paylaterStatus: 'pending',
      amount: parsedAmount,
      currency: "QAR",
      paymentLink: paymentUrl
    });

    await order.save();

    console.log(`✅ Order ${orderId} saved in DB`);
    console.log(`🚀 Payment link generated for order ${orderId}: ${paymentUrl}`);

    return res.json({ paymentUrl, paylaterOrderId, message: "PayLater order created successfully" });

  } catch (err) {
    console.error("❌ Error creating BNPL order:", err.response?.data || err.message);
    return res.status(500).json({ message: "Failed to create PayLater order", error: err.response?.data || err.message });
  }
};
