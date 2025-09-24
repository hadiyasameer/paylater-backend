import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

router.post('/', async (req, res) => {
  console.log("📩 Received webhook body from PayLater:", req.body);
  const { orderId, orderNumber, status, amount } = req.body;

  if ((!orderId && !orderNumber) || !status) {
    return res.status(400).send("Missing orderId/orderNumber or status");
  }

  // Determine Shopify order ID
  let shopifyOrderId = orderId;

  if (!shopifyOrderId && orderNumber) {
    try {
      const response = await axios.get(
        `https://${process.env.SHOPIFY_STORE}/admin/api/2025-07/orders.json?name=#${orderNumber}`,
        {
          headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
        }
      );

      if (response.data.orders.length === 0) {
        console.warn(`No Shopify order found for order number ${orderNumber}`);
        return res.status(404).send("Shopify order not found");
      }

      shopifyOrderId = response.data.orders[0].id;
    } catch (err) {
      console.error("Error fetching Shopify order by number:", err.response?.data || err.message);
      return res.status(500).send("Failed to fetch Shopify order");
    }
  }

  if (status === "paid") {
    try {
      const shopifyResponse = await axios.post(
        `https://${process.env.SHOPIFY_STORE}/admin/api/2025-07/orders/${shopifyOrderId}/transactions.json`,
        {
          transaction: {
            kind: "capture",
            status: "success",
            amount: parseFloat(amount).toFixed(2),
          },
        },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`Shopify order ${shopifyOrderId} marked as paid.`);
      console.log("🛒 Shopify response:", shopifyResponse.data);

    } catch (err) {
      console.error("Failed to update Shopify order:", err.response?.data || err.message);
    }
  }

  res.status(200).send("OK");
});

export default router;
