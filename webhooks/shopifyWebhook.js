// /webhooks/shopifyWebhook.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { sendPayLaterEmail } from '../utils/sendEmail.js';
import { connectDb } from '../utils/db.js';
import { Merchant } from '../models/merchant.js';
import { Order } from '../models/order.js';

dotenv.config();
const router = express.Router();

/**
 * Ensure PayLater link exists and send email if needed
 */
async function ensurePayLaterLink({ shopDomain, shopifyOrderId, amountNumber, customerEmail, merchant }) {
  await connectDb();

  let order = await Order.findOne({
    shopifyOrderId: String(shopifyOrderId),
    merchantId: merchant._id,
  });

  let paymentUrl = order?.paymentLink;

  if (!paymentUrl) {
    try {
      const response = await axios.post(
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

      paymentUrl = response.data?.paymentUrl;
      const paylaterOrderId = response.data?.paylaterOrderId || '';

      if (!paymentUrl) throw new Error('BNPL create-order returned no paymentUrl');

      console.log(`✅ PayLater link ready for order ${shopifyOrderId}: ${paymentUrl}`);

      if (!order) {
        order = new Order({
          shopifyOrderId: String(shopifyOrderId),
          paylaterOrderId,
          merchantId: merchant._id,
          amount: amountNumber,
          currency: response.data?.currency || 'QAR',
          paymentLink: paymentUrl,
          shopifyStatus: 'pending',
          paylaterStatus: 'pending',
        });
      } else {
        await order.updateStatuses({ paylaterStatus: 'pending' });
        order.paymentLink = paymentUrl;
        order.paylaterOrderId = paylaterOrderId;
      }

      await order.save();

      // Send email if customer email exists
      if (customerEmail) {
        await sendPayLaterEmail(String(customerEmail), String(shopifyOrderId), paymentUrl);
        console.log(`✉️ Email sent to ${customerEmail} for order ${shopifyOrderId}`);
      }
    } catch (err) {
      console.error(`❌ Failed to create PayLater order for ${shopifyOrderId}:`, err.response?.data || err.message);
    }
  }

  return paymentUrl;
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
        const totalStr = payload?.current_total_price ?? payload?.total_price ?? payload?.total_price_set?.shop_money?.amount;
        if (!shopifyOrderId || !totalStr) return res.status(200).send('Ignored: Missing order ID or total price');

        const amountNumber = Number(totalStr);
        if (!Number.isFinite(amountNumber) || amountNumber <= 0) return res.status(200).send('Ignored: Invalid amount');

        const gatewayNames = payload?.payment_gateway_names || [];
        const allGateways = [...gatewayNames, ...(payload?.gateway ? [payload.gateway] : [])].map(g => String(g || '').toLowerCase());
        const isPayLater = allGateways.some(g => g.includes('paylater'));
        if (!isPayLater) return res.status(200).send('Not a PayLater order');

        const customerEmail = payload?.email || payload?.customer?.email || payload?.contact_email || null;

        const paymentUrl = await ensurePayLaterLink({ shopDomain, shopifyOrderId, amountNumber, customerEmail, merchant });

        let order = await Order.findOne({ shopifyOrderId: String(shopifyOrderId), merchantId: merchant._id });
        if (!order) {
          order = new Order({
            shopifyOrderId: String(shopifyOrderId),
            paylaterOrderId: '', // already handled in ensurePayLaterLink
            merchantId: merchant._id,
            amount: amountNumber,
            currency: 'QAR',
            paymentLink: paymentUrl || '',
            shopifyStatus: payload?.financial_status || 'pending',
            paylaterStatus: 'pending',
          });
          await order.save();
        } else {
          await order.updateStatuses({
            shopifyStatus: payload?.financial_status || order.shopifyStatus,
            paylaterStatus: order.paylaterStatus,
          });
        }

        console.log(`✅ Order processed: ${shopifyOrderId}`);
        return res.status(200).send(`Processed ${topic}`);
      }

      case 'orders/paid':
      case 'orders/updated': {
        const shopifyOrderId = payload?.id;
        if (!shopifyOrderId) return res.status(200).send('Ignored: Missing order ID');

        const order = await Order.findOne({ shopifyOrderId: String(shopifyOrderId), merchantId: merchant._id });
        if (order) {
          await order.updateStatuses({ shopifyStatus: payload?.financial_status || order.shopifyStatus });
          console.log(`✅ Shopify payment status updated for ${shopifyOrderId}: ${order.shopifyStatus}`);
        }

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
