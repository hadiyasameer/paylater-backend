// /controllers/bnplController.js
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export const createBnplOrder = async (req, res) => {
  const { orderId, amount, successRedirectUrl, failRedirectUrl } = req.body;

  if (!orderId || !amount || !successRedirectUrl || !failRedirectUrl) {
    return res.status(400).json({ message: "Missing required fields" });
  }
  // ✅ Make orderId unique by appending timestamp
  const uniqueOrderId = `${orderId}-${Date.now()}`;

  const payload = {
    merchantId: process.env.BNPL_MERCHANT_ID,
    outletId: process.env.BNPL_OUTLET_ID,
    currency: "QAR",
    amount,
    orderId: uniqueOrderId,
    successRedirectUrl,
    failRedirectUrl
  };



  console.log("👉 Sending to PayLater:", payload);

  try {
    const response = await axios.post(
      `${process.env.BNPL_BASE_URL}/api/paylater/merchant-portal/web-checkout/`,
      payload,
      {
        headers: {
          'x-api-key': process.env.BNPL_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("✅ PayLater API response:", response.data);
    return res.json({ paymentUrl: response.data.paymentLinkUrl });

  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;

    // 👉 Handle duplicate order ID
    if (errorMsg.includes("Order ID already exists")) {
      console.warn(`⚠️ Order ID ${orderId} already exists in PayLater system.`);

      // If PayLater returns the existing payment link, return it
      const existingLink = err.response?.data?.paymentLinkUrl;

      if (existingLink) {
        return res.json({ paymentUrl: existingLink });
      }

      // Fallback: generate a frontend link with order ID
      const fallbackUrl = `${successRedirectUrl}?orderId=${orderId}`;
      console.log(`⚠️ Using fallback PayLater link: ${fallbackUrl}`);
      return res.json({ paymentUrl: fallbackUrl });
    }

    // ❌ If other error, return 500
    console.error("Error creating BNPL order:", err.response?.data || err.message);
    return res.status(500).json({
      message: "Failed to create PayLater order",
      error: err.response?.data || err.message
    });
  }
};
