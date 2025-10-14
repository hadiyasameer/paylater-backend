import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
import { sendPayLaterEmail } from '../utils/sendEmail.js';
import { connectDb } from "../utils/db.js";
import { Merchant } from "../models/merchant.js";
import { verifyShopifyWebhook } from "../utils/shopifyhmac.js"

dotenv.config();
const router = express.Router();

// Shopify Webhook: Handles orders and triggers PayLater link
router.post('/', verifyShopifyWebhook, async (req, res) => {
  await connectDb();

  const shopDomain = req.headers['x-shopify-shop-domain'];
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const body = JSON.stringify(req.body);

  if (!shopDomain || !hmacHeader) return res.status(400).send("Missing shop domain or HMAC");


  const order = req.body;
  if (!order || !order.id) {
    console.warn("Invalid Shopify order payload:", order);
    return res.status(400).send("Invalid payload");
  }

  console.log(`Received verified Shopify order: ${order.id}`);

  const merchant = await Merchant.findOne({ shop: shopDomain });
  if (!merchant) return res.status(404).send("Merchant not found");

  // Check if this order uses PayLater
  const isPayLater = order.payment_gateway_names?.some(gw => gw.toLowerCase().includes("paylater"));
  if (!isPayLater) {
    console.log(`Order ${order.id} is not PayLater. Skipping.`);
    return res.status(200).send("Not a PayLater order");
  }

  let paymentUrl;
  try {
    const response = await axios.post(`${process.env.SERVER_URL}/api/bnpl/create-order`, {
      orderId: order.id,
      amount: parseFloat(order.total_price),
      successRedirectUrl: `${process.env.FRONTEND_URL}/pages/paylater-success`,
      failRedirectUrl: `${process.env.FRONTEND_URL}/pages/paylater-failed`,
      paylaterMerchantId: merchant.paylaterMerchantId,
      outletId: merchant.outletId
    });

    paymentUrl = response.data.paymentUrl;

  } catch (err) {
    if (err.response?.data?.message?.includes("already exists")) {
      paymentUrl = err.response?.data?.paymentLinkUrl || `${process.env.FRONTEND_URL}/pages/paylater-info?orderId=${order.id}`;
    } else {
      console.error("❌ Failed to create PayLater order:", err.response?.data || err.message);
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

  res.status(200).send("PayLater link handled dynamically");
});

export default router;
