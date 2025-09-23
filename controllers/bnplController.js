import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export const createBnplOrder = async (req, res) => {
  const { orderId, amount, successRedirectUrl, failRedirectUrl } = req.body;

  if (!orderId || !amount || !successRedirectUrl || !failRedirectUrl) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const payload = {
    merchantId: process.env.BNPL_MERCHANT_ID,
    outletId: process.env.BNPL_OUTLET_ID,
    currency: "QAR",
    amount,
    orderId,
    successRedirectUrl,
    failRedirectUrl
  };

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

    res.json({ paymentUrl: response.data.paymentLinkUrl });

  } catch (err) {
    console.error("Error creating BNPL order:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to create PayLater order", error: err.response?.data || err.message });
  }
};
