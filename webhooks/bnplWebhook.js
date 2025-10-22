import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { Merchant } from '../models/merchant.js';
import { Order } from '../models/order.js';
import { decrypt } from '../utils/encryption.js';
import { sendCancellationEmail } from '../utils/sendEmail.js';

const router = express.Router();

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

const normalizeStatus = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'success' || s === 'paid') return 'paid';
  if (s === 'failed' || s === 'cancelled') return 'failed';
  return 'pending';
};

const updateShopifyOrderStatus = async (shop, accessToken, orderId, financialStatus) => {
  try {
    const url = `https://${shop}/admin/api/2025-10/orders/${orderId}.json`;
    const data = { order: { id: orderId, financial_status: financialStatus } };
    const response = await axios.put(url, data, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    console.log(`🚀 Shopify order ${orderId} updated: financial_status=${financialStatus}`);
  } catch (err) {
    console.error(`❌ Failed to update Shopify order ${orderId}:`, err.response?.data || err.message);
  }
};

const captureShopifyTransaction = async (shop, accessToken, orderId, amount) => {
  try {
    const url = `https://${shop}/admin/api/2025-10/orders/${orderId}/transactions.json`;
    const data = { transaction: { kind: 'capture', status: 'success', amount: amount } };
    const response = await axios.post(url, data, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    console.log(`💰 Shopify transaction captured for order ${orderId}:`, response.data);
  } catch (err) {
    console.error(`❌ Failed to capture Shopify transaction for order ${orderId}:`, err.response?.data || err.message);
  }
};

router.post('/', async (req, res) => {
  try {
    console.log('📩 BNPL Webhook received:', JSON.stringify(req.body, null, 2));

    const { merchantId, orderId, status, timestamp, txHash, signature, comments } = req.body || {};

    if (!merchantId || !orderId || !status || !timestamp || !txHash || !signature) {
      console.warn('⚠️ Missing required fields:', req.body);
      return res.status(400).send('Missing required fields');
    }

    const merchant = await Merchant.findOne({ paylaterMerchantId: merchantId });
    if (!merchant) return res.status(404).send('Merchant not found');

    let webhookSecretPlain;
    try {
      webhookSecretPlain = decrypt(merchant.webhookSecret);
    } catch (e) {
      console.error('❌ Failed to decrypt webhook secret:', e?.message || e);
      return res.status(500).send('Merchant secret unavailable');
    }

    const cleanComments = String((comments || '').trim());
    const dataString = `${merchantId}${orderId}${status}${timestamp}${cleanComments}`.toUpperCase();
    const computedTxHash = crypto.createHash('md5').update(dataString).digest('hex');
    const computedSignature = crypto
      .createHmac('sha256', webhookSecretPlain)
      .update(computedTxHash)
      .digest('hex');

    if (!safeEqual(computedTxHash, txHash) || !safeEqual(computedSignature, signature)) {
      console.error('❌ Signature verification failed!');
      return res.status(403).send('Invalid signature');
    }

    let order =
      (await Order.findOne({ paylaterOrderId: orderId, merchantId: merchant._id })) ||
      (await Order.findOne({ shopifyOrderId: String(orderId), merchantId: merchant._id }));

    if (!order) {
      order = new Order({
        paylaterOrderId: orderId,
        merchantId: merchant._id,
        shopifyStatus: 'pending',
        paylaterStatus: 'pending',
        customerEmail: req.body.customerEmail || req.body.email || 'unknown@example.com',
        customerName: req.body.customerName || req.body.fullname || 'Customer'
      });
      await order.save();
      console.log(`🆕 Created new order record for BNPL order ${orderId} with email ${order.customerEmail}`);
    }


    const nextStatus = normalizeStatus(status);
    console.log(`🔄 Normalized BNPL status for order ${orderId}: ${nextStatus}`);

    await order.updateStatuses({
      paylaterStatus: nextStatus,
      transactionId: txHash,
      paymentDate: new Date(Number(timestamp)),
      comments: cleanComments.slice(0, 2000)
    });

    const decryptedAccessToken = decrypt(merchant.accessToken);

    if (nextStatus === 'paid') {
      console.log(`💰 Handling paid status for order ${orderId}`);
      if (order.shopifyStatus !== 'paid') {
        await captureShopifyTransaction(merchant.shop, decryptedAccessToken, order.shopifyOrderId, order.amount);
        await updateShopifyOrderStatus(merchant.shop, decryptedAccessToken, order.shopifyOrderId, 'paid');
        order.shopifyStatus = 'paid';
        await order.save();
        console.log(`✅ Shopify order ${order.shopifyOrderId} marked as paid via BNPL webhook`);
      }
    } else if (nextStatus === 'failed') {
      console.log(`⚠️ Handling failed/cancelled status for order ${orderId}`);
      order.shopifyStatus = 'cancelled';
      await updateShopifyOrderStatus(merchant.shop, decryptedAccessToken, order.shopifyOrderId, 'cancelled');
      await order.save();
      console.log(`🛑 Shopify order ${order.shopifyOrderId} marked as cancelled`);

      if (order.customerEmail) {
        try {
          await sendCancellationEmail({
            email: order.customerEmail,
            fullname: order.customerName,
            order
          });
          console.log(`✉️ Cancellation email sent for failed BNPL order ${orderId}`);
        } catch (err) {
          console.error(`❌ Failed to send cancellation email for order ${orderId}:`, err.message || err);
        }
      }
    } else {
      console.log(`ℹ️ No action required for order ${orderId} with status ${nextStatus}`);
    }

    console.log(`✅ Webhook processing complete for order ${orderId}`);
    return res.status(200).send('Webhook processed successfully');
  } catch (err) {
    console.error('❌ BNPL webhook error:', err);
    return res.status(500).send('Processed with internal errors');
  }
});

export default router;
