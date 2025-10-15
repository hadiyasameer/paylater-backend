// /webhooks/shopifyWebhook.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { sendPayLaterEmail } from '../utils/sendEmail.js';
import { connectDb } from '../utils/db.js';
import { Merchant } from '../models/merchant.js';
import { Order } from '../models/order.js';
import { verifyShopifyWebhook } from '../utils/shopifyhmac.js';

dotenv.config();
const router = express.Router();

async function ensurePayLaterLinkAndEmail({ shopDomain, shopifyOrderId, amountNumber, customerEmail, merchant }) {
  await connectDb();

  let existingOrder = await Order.findOne({
    shopifyOrderId: String(shopifyOrderId),
    merchantId: merchant._id,
  });

  let paymentUrl = existingOrder?.paymentLink;

  if (!paymentUrl) {
    try {
      const createRes = await axios.post(
        `${process.env.SERVER_URL}/api/bnpl/create-order`,
        {
          orderId: String(shopifyOrderId),
          amount: amountNumber,
          successRedirectUrl: merchant.successUrl || `${process.env.FRONTEND_URL}/pages/paylater-success`,
          failRedirectUrl: merchant.failUrl || `${process.env.FRONTEND_URL}/pages/paylater-failed`,
          paylaterMerchantId: merchant.paylaterMerchantId,
          outletId: merchant.paylaterOutletId,
        },
        { timeout: 12000 }
      );

      paymentUrl = createRes.data?.paymentUrl;
      if (!paymentUrl) throw new Error('BNPL create-order returned no paymentUrl');

      console.log(`✅ PayLater link ready for order ${shopifyOrderId}: ${paymentUrl}`);
    } catch (err) {
      console.error(`❌ Failed to create PayLater order for ${shopifyOrderId}:`, err.response?.data || err.message);
    }
  } else {
    console.log(`ℹ️ Reusing existing PayLater link for order ${shopifyOrderId}: ${paymentUrl}`);
  }

  if (customerEmail && paymentUrl) {
    try {
      await sendPayLaterEmail(String(customerEmail), String(shopifyOrderId), paymentUrl);
      console.log(`✉️ Email sent to ${customerEmail} for order ${shopifyOrderId}`);
    } catch (emailErr) {
      console.error(`❌ Failed to send email for order ${shopifyOrderId}: ${emailErr.message}`);
    }
  }

  return paymentUrl;
}

router.post('/', verifyShopifyWebhook, async (req, res) => {
  const shopDomain = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];

  if (!shopDomain || !topic) return res.status(200).send('Ignored: Missing headers');

  await connectDb();
  const merchant = await Merchant.findOne({ shop: shopDomain });
  if (!merchant) return res.status(200).send('Ignored: Merchant not found');

  const payload = req.body;

  try {
    switch (topic) {
      case 'orders/create':
      case 'checkouts/create': {
        const shopifyOrderId = payload?.id;
        const totalStr =
          payload?.current_total_price ??
          payload?.total_price ??
          payload?.total_price_set?.shop_money?.amount;

        if (!shopifyOrderId || !totalStr) return res.status(200).send('Ignored: Missing order data');

        const amountNumber = Number(totalStr);
        if (!Number.isFinite(amountNumber) || amountNumber <= 0) return res.status(200).send('Ignored: Invalid amount');

        const gatewayNames = payload?.payment_gateway_names || [];
        const allGateways = [...gatewayNames, ...(payload?.gateway ? [payload.gateway] : [])].map(g => String(g || '').toLowerCase());
        const isPayLater = allGateways.some(g => g.includes('paylater'));
        if (!isPayLater) return res.status(200).send('Not a PayLater order');

        const customerEmail = payload?.email || payload?.customer?.email || payload?.contact_email || null;

        await ensurePayLaterLinkAndEmail({ shopDomain, shopifyOrderId, amountNumber, customerEmail, merchant });

        return res.status(200).send(`Processed ${topic}`);
      }

      default:
        console.log(`ℹ️ Ignored Shopify webhook topic: ${topic}`);
        return res.status(200).send('Ignored topic');
    }
  } catch (err) {
    console.error('❌ Shopify webhook processing error:', err.message);
    return res.status(200).send('Processed with internal errors');
  }
});

export default router;
