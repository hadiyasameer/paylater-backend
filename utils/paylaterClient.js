import axios from 'axios';
import { Order } from '../models/order.js';
import { Merchant } from '../models/merchant.js';
import { sendPayLaterEmail } from './sendEmail.js';
import { encrypt, decrypt } from '../utils/encryption.js';

const bnplApi = axios.create({
  baseURL: process.env.BNPL_BASE_URL,
  timeout: 10000,
  headers: {
    'x-api-key': process.env.BNPL_API_KEY,
    'Content-Type': 'application/json'
  }
});

async function sendPayLaterRequest(payload, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await bnplApi.post('/api/paylater/merchant-portal/web-checkout/', payload);
      if (!response.data?.paymentLinkUrl) throw new Error('No payment link returned');
      return response.data;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ PayLater request attempt ${attempt} failed:`, err.message);
      if (attempt < retries) await new Promise(res => setTimeout(res, 1000 * attempt)); 
    }
  }
  console.error('❌ All PayLater API retries failed, fallback triggered', payload);
  throw lastError;
}

export async function createPayLaterOrder({
  shopifyOrderId,
  amount,
  successRedirectUrl,
  failRedirectUrl,
  paylaterMerchantId,
  outletId,
  customerEmail = null,
  customerName = null
}) {
  const merchant = await Merchant.findOne({ paylaterMerchantId });
  if (!merchant) throw new Error('Unknown merchant');

  const { accessToken: decryptedToken } = merchant.getDecryptedData();

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Invalid amount');

  let order = await Order.findOne({ shopifyOrderId: String(shopifyOrderId), merchantId: merchant._id });
  if (order) {
    console.log(`🔁 Existing PayLater link reused for order ${shopifyOrderId}`);
    const decryptedLink = decrypt(order.paymentLink);
    return { paymentUrl: decryptedLink, paylaterOrderId: order.paylaterOrderId };
  }

  const uniqueOrderId = String(shopifyOrderId);
  const payload = {
    merchantId: paylaterMerchantId,
    outletId,
    currency: 'QAR',
    amount: parsedAmount,
    orderId: uniqueOrderId,
    successRedirectUrl,
    failRedirectUrl
  };

  console.log('👉 Sending PayLater request:', payload);

  let responseData;
  try {
    responseData = await sendPayLaterRequest(payload, 3);
  } catch (err) {
    console.error('❌ Failed to create PayLater order after retries:', err.message);
    throw err;
  }

  const paymentUrl = responseData.paymentLinkUrl;
  const paylaterRef = responseData.paylaterRef || uniqueOrderId;
  if (!paymentUrl) throw new Error('PayLater API returned no payment link');

  order = new Order({
    shopifyOrderId: uniqueOrderId,
    paylaterOrderId: paylaterRef,
    merchantId: merchant._id,
    merchant: merchant.shop,
    shopifyStatus: 'pending',
    paylaterStatus: 'pending',
    amount: parsedAmount,
    currency: 'QAR',
    paymentLink: encrypt(paymentUrl),
    customerEmail,
    customerName
  });

  await order.save();
  console.log(`✅ PayLater order saved in DB for Shopify order ${shopifyOrderId}`);

  if (customerEmail) {
    try {
      await sendPayLaterEmail({
        email: customerEmail,
        fullname: customerName || customerEmail,
        order: {
          paylaterOrderId: paylaterRef,
          merchant: merchant.shop,
          date: new Date().toLocaleString('en-US', { timeZone: 'Asia/Qatar' }),
          amount: parsedAmount,
          currency: 'QAR',
          paymentlink: paymentUrl
        }
      });
      console.log(`✉️ PayLater email sent to ${customerEmail} for order ${shopifyOrderId}`);
    } catch (err) {
      console.error('❌ Failed to send PayLater email:', err);
    }
  }

  try {
    const { data: shopifyOrder } = await axios.get(
      `https://${merchant.shop}/admin/api/2025-10/orders/${shopifyOrderId}.json`,
      { headers: { 'X-Shopify-Access-Token': decryptedToken } }
    );

    const currentTags = shopifyOrder.order.tags || '';
    const newTags = currentTags.includes('PayLater')
      ? currentTags
      : currentTags
        ? `${currentTags}, PayLater`
        : 'PayLater';

    if (newTags !== currentTags) {
      await axios.put(
        `https://${merchant.shop}/admin/api/2025-10/orders/${shopifyOrderId}.json`,
        { order: { id: shopifyOrderId, tags: newTags } },
        { headers: { 'X-Shopify-Access-Token': decryptedToken } }
      );
      console.log(`✅ Shopify tag 'PayLater' added for order ${shopifyOrderId}`);
    }
  } catch (tagErr) {
    console.error('⚠️ Failed to add PayLater tag:', tagErr.response?.data || tagErr.message);
  }

  return { paymentUrl, paylaterOrderId: paylaterRef };
}
