// /webhooks/shopifyWebhook.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { sendPayLaterEmail } from '../utils/sendEmail.js';

dotenv.config();
const router = express.Router();

router.post('/', async (req, res) => {
  const order = req.body;
  if (!order || !order.id) {
    console.warn("Invalid Shopify order payload:", order);
    return res.status(400).send("Invalid payload");
  }
  console.log(`Received Shopify order: ${order.id}`);

  // Check if this order uses PayLater
  const isPayLater = order.payment_gateway_names?.includes("PayLater – Pay in 4 (0% Interest)");
  if (!isPayLater) {
    console.log(`Order ${order.id} is not PayLater. Skipping.`);
    return res.status(200).send("Not a PayLater order");
  }

  let paymentUrl;

  try {
    // Try to create a new BNPL order
    const response = await axios.post(`${process.env.SERVER_URL}/api/bnpl/create-order`, {
      orderId: order.id,
      amount: order.total_price,
      successRedirectUrl: `${process.env.FRONTEND_URL}/pages/paylater-success`,
      failRedirectUrl: `${process.env.FRONTEND_URL}/pages/paylater-failed`
    });

    paymentUrl = response.data.paymentUrl;
    console.log(`✅ BNPL payment link for Shopify order ${order.id}: ${paymentUrl}`);

  } catch (err) {
    // Handle "order already exists" error
    if (err.response?.data?.message?.includes("already exists")) {
      console.warn(`Order ${order.id} already exists in PayLater.`);
      // PayLater sometimes returns the link in the error response
      paymentUrl = err.response?.data?.paymentLinkUrl;
      if (!paymentUrl) {
        // If not, generate a fallback link using your frontend
        paymentUrl = `${process.env.FRONTEND_URL}/pages/paylater-info?orderId=${order.id}`;
        console.log(`Using fallback payment link for order ${order.id}: ${paymentUrl}`);
      }
    } else {
      console.error("Failed to create PayLater order:", err.response?.data || err.message);
      return res.status(500).send("Failed to create PayLater order");
    }
  }

  // Send email to the customer
  const customerEmail = order.email;
  if (customerEmail && paymentUrl) {
    try {
      await sendPayLaterEmail(customerEmail, order.id, paymentUrl);
      console.log(`✉️ Email sent to ${customerEmail} with PayLater link.`);
    } catch (emailErr) {
      console.error(`❌ Failed to send email to ${customerEmail}:`, emailErr.message);
    }
  } else {
    console.warn(`No email or payment link available for order ${order.id}`);
  }

  res.status(200).send("PayLater link handled successfully");
});

export default router;
