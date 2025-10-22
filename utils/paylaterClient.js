import axios from 'axios';
import { Order } from '../models/order.js';
import { Merchant } from '../models/merchant.js';
import { sendPayLaterEmail } from './sendEmail.js';
import { encrypt, decrypt } from '../utils/encryption.js';

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

  const response = await axios.post(
    `${process.env.BNPL_BASE_URL}/api/paylater/merchant-portal/web-checkout/`,
    payload,
    {
      headers: {
        'x-api-key': process.env.BNPL_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  const paymentUrl = response.data?.paymentLinkUrl;
  const paylaterRef = response.data?.paylaterRef || uniqueOrderId;
  if (!paymentUrl) throw new Error('PayLater API returned no payment link');

  const encryptedPaymentLink = encrypt(paymentUrl);

  order = new Order({
    shopifyOrderId: String(shopifyOrderId),
    paylaterOrderId: paylaterRef,
    merchantId: merchant._id,
    shopifyStatus: 'pending',
    paylaterStatus: 'pending',
    amount: parsedAmount,
    currency: 'QAR',
    paymentLink: paymentUrl,
    customerEmail: customerEmail || null,
    customerName: customerName || null
  });


  await order.save();

  const orderData = {
    paylaterOrderId: paylaterRef,
    merchant: merchant.shop,
    date: new Date().toLocaleString('en-US', { timeZone: 'Asia/Qatar' }),
    amount: parsedAmount,
    currency: 'QAR',
    paymentlink: paymentUrl
  };

  if (customerEmail) {
    try {
      await sendPayLaterEmail({
        email: customerEmail,
        fullname: customerName || customerEmail,
        order: orderData
      });
      console.log(`✉️ PayLater email sent to ${customerEmail} for order ${shopifyOrderId}`);
    } catch (err) {
      console.error('❌ Failed to send PayLater email:', err);
    }
  }

  console.log(`✅ PayLater link ready for order ${shopifyOrderId}: ${paymentUrl} (ref ${paylaterRef})`);
  return { paymentUrl, paylaterOrderId: paylaterRef };
}
