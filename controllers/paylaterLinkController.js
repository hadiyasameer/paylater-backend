import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export const getPayLaterLink = async (req, res) => {
  const { order_id, amount, customer_email } = req.query;

  if (!order_id || !amount || !customer_email) {
    return res.status(400).send("Missing required parameters");
  }

  const payload = {
    merchantId: process.env.BNPL_MERCHANT_ID,
    outletId: process.env.BNPL_OUTLET_ID,
    currency: "QAR",
    amount,
    orderId: order_id,
    successRedirectUrl: "https://your-store.myshopify.com/pages/paylater-success",
    failRedirectUrl: "https://your-store.myshopify.com/pages/paylater-failed"
  };

  try {
    const response = await axios.post(
      `${process.env.BNPL_BASE_URL}/paylater/merchant-portal/web-checkout/`,
      payload,
      {
        headers: {
          'x-api-key': process.env.BNPL_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    // Redirect user to PayLater payment page
    res.redirect(response.data.paymentLinkUrl);

  } catch (err) {
    console.error("Error getting PayLater link:", err.response?.data || err.message);
    res.status(500).send("Failed to generate PayLater link");
  }
};
