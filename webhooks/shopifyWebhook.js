import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { sendPayLaterEmail } from '../utils/sendEmail.js';
import { connectDb } from '../utils/db.js';
import { Merchant } from '../models/merchant.js';
import { Order } from '../models/order.js';

dotenv.config();
const router = express.Router();

async function ensurePayLaterLink({ shopifyOrderId, amountNumber, customerEmail, merchant }) {
  await connectDb();

  let order = await Order.findOne({
    shopifyOrderId: String(shopifyOrderId),
    merchantId: merchant._id,
  });

  if (order?.paymentLink) {
    console.log(`🔁 Existing PayLater link reused for order ${shopifyOrderId}`);
    return { paymentUrl: order.paymentLink, paylaterOrderId: order.paylaterOrderId };
  }

  try {
    const response = await axios.post(
      `${process.env.SERVER_URL}/api/bnpl/create-order`,
      {
        orderId: String(shopifyOrderId),
        amount: amountNumber,
        successRedirectUrl:
          merchant.successUrl || `${process.env.FRONTEND_URL}/pages/paylater-success`,
        failRedirectUrl:
          merchant.failUrl || `${process.env.FRONTEND_URL}/pages/paylater-failed`,
        paylaterMerchantId: merchant.paylaterMerchantId,
        outletId: merchant.paylaterOutletId,
      },
      { timeout: 10000 }
    );

    const paymentUrl = response.data?.paymentUrl;
    const paylaterOrderId = response.data?.paylaterOrderId;

    if (!paymentUrl || !paylaterOrderId)
      throw new Error('BNPL create-order returned incomplete data');

    order = await Order.findOneAndUpdate(
      { shopifyOrderId: String(shopifyOrderId), merchantId: merchant._id },
      {
        paylaterOrderId,
        amount: amountNumber,
        currency: response.data?.currency || 'QAR',
        paymentLink: paymentUrl,
        shopifyStatus: 'pending',
        paylaterStatus: 'pending',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (customerEmail) {
      await sendPayLaterEmail(String(customerEmail), String(shopifyOrderId), paymentUrl);
      console.log(`✉️ Email sent to ${customerEmail} for order ${shopifyOrderId}`);
    }

    console.log(`✅ PayLater link ready for order ${shopifyOrderId}: ${paymentUrl}`);
    return { paymentUrl, paylaterOrderId };
  } catch (err) {
    console.error(`❌ Failed to create PayLater order for ${shopifyOrderId}:`, err.response?.data || err.message);
    return { paymentUrl: null, paylaterOrderId: null };
  }
}


router.post('/', async (req, res) => {
  console.log('📥 Shopify webhook received');

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

        if (!shopifyOrderId || !totalStr)
          return res.status(200).send('Ignored: Missing order ID or total price');

        const amountNumber = Number(totalStr);
        if (!Number.isFinite(amountNumber) || amountNumber <= 0)
          return res.status(200).send('Ignored: Invalid amount');

        const gatewayNames = payload?.payment_gateway_names || [];
        const allGateways = [
          ...gatewayNames,
          ...(payload?.gateway ? [payload.gateway] : []),
        ].map((g) => String(g || '').toLowerCase());

        const isPayLater = allGateways.some((g) => g.includes('paylater'));
        if (!isPayLater) return res.status(200).send('Not a PayLater order');

        const customerEmail =
          payload?.email || payload?.customer?.email || payload?.contact_email || null;

        res.status(200).send(`Webhook received: ${topic}`);

        ensurePayLaterLink({ shopifyOrderId, amountNumber, customerEmail, merchant })
          .catch((err) => console.error('Error in async PayLater processing:', err));

        const order = await Order.findOne({
          shopifyOrderId: String(shopifyOrderId),
          merchantId: merchant._id,
        });
        if (order) {
          order.shopifyStatus = payload?.financial_status || order.shopifyStatus;
          await order.save();
        }

        console.log(`✅ Order processing triggered: ${shopifyOrderId}`);
        break;
      }

      case 'orders/paid':
      case 'orders/updated': {
        const shopifyOrderId = payload?.id;
        if (!shopifyOrderId) return res.status(200).send('Ignored: Missing order ID');

        const order = await Order.findOne({
          shopifyOrderId: String(shopifyOrderId),
          merchantId: merchant._id,
        });
        if (order) {
          order.shopifyStatus = payload?.financial_status || order.shopifyStatus;
          await order.save();
          console.log(
            `✅ Shopify payment status updated for ${shopifyOrderId}: ${order.shopifyStatus}`
          );
        }

        res.status(200).send(`Webhook received: ${topic}`);
        break;
      }

      default:
        console.log(`ℹ️ Ignored Shopify webhook topic: ${topic}`);
        res.status(200).send('Ignored topic');
    }
  } catch (err) {
    console.error('❌ Shopify webhook processing error:', err);
    res.status(500).send('Processed with internal errors');
  }
});

export default router;
