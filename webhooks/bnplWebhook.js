import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

router.post('/', async (req, res) => {
  const { orderId, status, amount } = req.body;

  console.log(`Received PayLater status for order ${orderId}: ${status}`);

  // Only update Shopify if payment is successful
  if (status === "paid") {
    try {
      const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // e.g., midev-store.myshopify.com
      const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

      // Update Shopify order
      await axios.post(
        `https://${SHOPIFY_STORE}/admin/api/2025-07/orders/${orderId}/transactions.json`,
        {
          transaction: {
            kind: "capture",
            status: "success",
            amount: amount
          }
        },
        {
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json"
          }
        }
      );


      console.log(`Shopify order ${orderId} marked as paid.`);
    } catch (err) {
      console.error("Failed to update Shopify order:", err.response?.data || err.message);
    }
  }

  res.status(200).send("OK");
});

export default router;
