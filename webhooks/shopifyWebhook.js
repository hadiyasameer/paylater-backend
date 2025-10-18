import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { sendPayLaterEmail } from '../utils/sendEmail.js';
import { connectDb } from '../utils/db.js';
import { Merchant } from '../models/merchant.js';
import { Order } from '../models/order.js';

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

router.post('/', async (req, res) => {
  console.log('📥 Shopify webhook hit');

  const shopDomain = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];

  console.log('🔹 Headers:', { shopDomain, topic });

  if (!shopDomain || !topic) {
    console.warn('⚠️ Missing required Shopify headers');
    return res.status(200).send('Ignored: Missing headers');
  }

  await connectDb();

  const merchant = await Merchant.findOne({ shop: shopDomain });
  if (!merchant) {
    console.warn(`⚠️ Merchant not found for shopDomain: ${shopDomain}`);
    return res.status(200).send('Ignored: Merchant not found');
  }

  const payload = req.body;
  console.log('📝 Payload received:', JSON.stringify(payload, null, 2));

  try {
    switch (topic) {
      case 'orders/create':
      case 'checkouts/create': {
        const shopifyOrderId = payload?.id;
        const totalStr =
          payload?.current_total_price ??
          payload?.total_price ??
          payload?.total_price_set?.shop_money?.amount;

        if (!shopifyOrderId) {
          console.warn('⚠️ Missing shopifyOrderId in payload');
          return res.status(200).send('Ignored: Missing order ID');
        }

        if (!totalStr) {
          console.warn('⚠️ Missing total price in payload');
          return res.status(200).send('Ignored: Missing total price');
        }

        const amountNumber = Number(totalStr);
        if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
          console.warn('⚠️ Invalid amount:', totalStr);
          return res.status(200).send('Ignored: Invalid amount');
        }

        const gatewayNames = payload?.payment_gateway_names || [];
        const allGateways = [...gatewayNames, ...(payload?.gateway ? [payload.gateway] : [])].map(g =>
          String(g || '').toLowerCase()
        );

        const isPayLater = allGateways.some(g => g.includes('paylater'));
        if (!isPayLater) {
          console.log('ℹ️ Not a PayLater order:', allGateways);
          return res.status(200).send('Not a PayLater order');
        }

        const customerEmail = payload?.email || payload?.customer?.email || payload?.contact_email || null;

        await ensurePayLaterLinkAndEmail({ shopDomain, shopifyOrderId, amountNumber, customerEmail, merchant });

        console.log(`✅ Shopify webhook processed for order ${shopifyOrderId}`);
        return res.status(200).send(`Processed ${topic}`);
      }

      default:
        console.log(`ℹ️ Ignored Shopify webhook topic: ${topic}`);
        return res.status(200).send('Ignored topic');
    }
  } catch (err) {
    console.error('❌ Shopify webhook processing error:', err);
    return res.status(500).send('Processed with internal errors');
  }
});

export default router;
