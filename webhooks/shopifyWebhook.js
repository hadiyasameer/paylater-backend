import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

// Shopify raw body parser requires middleware at server level
router.post('/', async (req, res) => {
  const order = JSON.parse(req.body.toString()); // convert raw body to JSON
  console.log("Received Shopify order:", order.id);

  const paymentMethod = order.payment_gateway_names?.includes("PayLater – Pay in 4 (0% Interest)");
  if (!paymentMethod) return res.status(200).send("Not a PayLater order");

  try {
    const response = await axios.post(`${process.env.SERVER_URL}/api/bnpl/create-order`, {
      orderId: order.id,
      amount: order.total_price,
      successRedirectUrl: `${process.env.FRONTEND_URL}/success`,
      failRedirectUrl: `${process.env.FRONTEND_URL}/fail`
    });

    const paymentUrl = response.data.paymentUrl;

    console.log(`BNPL payment link for Shopify order ${order.id}: ${paymentUrl}`);

    // Optionally send to customer via Shopify fulfillment message
    await axios.post(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2025-07/orders/${order.id}/fulfillments.json`,
      {
        fulfillment: {
          location_id: process.env.SHOPIFY_LOCATION_ID,
          tracking_numbers: [],
          notify_customer: true,
          message: `Complete your payment here: ${paymentUrl}`
        }
      },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).send("PayLater link sent");

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Failed to create PayLater order");
  }
});

export default router;
