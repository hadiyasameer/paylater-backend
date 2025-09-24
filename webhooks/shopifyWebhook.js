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

  const paymentMethod = order.payment_gateway_names?.includes("PayLater – Pay in 4 (0% Interest)");
  if (!paymentMethod) {
    console.log(`Order ${order.id} is not PayLater. Skipping.`);
    return res.status(200).send("Not a PayLater order");
  }

  try {
    const response = await axios.post(`${process.env.SERVER_URL}/api/bnpl/create-order`, {
      orderId: order.id,
      amount: order.total_price,
      successRedirectUrl: `${process.env.FRONTEND_URL}/pages/paylater-success`,
      failRedirectUrl: `${process.env.FRONTEND_URL}/pages/paylater-failed`
    });

    const paymentUrl = response.data.paymentUrl;
    console.log(`BNPL payment link for Shopify order ${order.id}: ${paymentUrl}`);

    // Send email to the customer
    const customerEmail = order.email;
    if (customerEmail) {
      await sendPayLaterEmail(customerEmail, order.id, paymentUrl);
      console.log(`Email sent to ${customerEmail} with PayLater link.`);
    } else {
      console.warn(`No email found for order ${order.id}`);
    }

    res.status(200).send("PayLater link sent via email");

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Failed to create PayLater order");
  }

});

export default router;
