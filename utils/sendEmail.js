import axios from "axios";
import { decrypt } from "./encryption.js"; 

export const sendPayLaterEmail = async ({ email, fullname, order, cancelTimeLimit }) => {
  if (!email) return console.warn("No customer email provided, skipping email.");

  const remainingtime =
    (cancelTimeLimit !== undefined ? cancelTimeLimit :
      order.cancelTimeLimit !== undefined ? order.cancelTimeLimit : 10);

  const payload = {
    app_id: process.env.ONESIGNAL_APP_ID,
    target_channel: "email",
    template_id: process.env.ONESIGNAL_TEMPLATE_ID,
    include_unsubscribed: true,
    include_email_tokens: [email],
    custom_data: {
      user: { fullname },
      order: {
        orderid: order.paylaterOrderId,
        merchantname: order.merchant || "Your Shop",
        date: order.date,
        amount: order.amount ?? 0,
        currency: order.currency || "QAR",
        remainingtime,
        paymentlink: order.paymentLink || order.paymentlink
      }
    }
  };
  console.log('OneSignal email payload:', JSON.stringify(payload, null, 2));


  try {
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${process.env.ONESIGNAL_REST_KEY}`
        }
      }
    );

    console.log(`✅ Payment link email sent to ${email} for order ${order.paylaterOrderId}`, response.data);
    return response.data;
  } catch (err) {
    console.error(`❌ Failed to send email to ${email}:`, err.response?.data || err.message);
  }
};

export const sendExpiryWarningEmail = async ({ email, fullname, order, cancelTimeLimit }) => {
  if (!email) return console.warn("No email provided, skipping expiry warning.");

  const remainingtime =
    (cancelTimeLimit !== undefined ? cancelTimeLimit :
      order.cancelTimeLimit !== undefined ? order.cancelTimeLimit : 10);
  let decryptedLink = null;
  try {
    const encryptedLink =
      order.paymentLink ||
      order.paymentlink ||
      order.payment_link ||
      order.payLaterLink ||
      order.link ||
      order?.links?.paymentLink;

    decryptedLink = encryptedLink ? decrypt(encryptedLink) : null;
  } catch (err) {
    console.error("❌ Failed to decrypt payment link:", err.message);
  }
  const payload = {
    app_id: process.env.ONESIGNAL_APP_ID,
    target_channel: "email",
    template_id: process.env.ONESIGNAL_TEMPLATE_ID,
    include_unsubscribed: true,
    include_email_tokens: [email],
    custom_data: {
      user: { fullname },
      order: {
        orderid: order.paylaterOrderId,
        merchantname: typeof order.merchant === "string" ? order.merchant : order.merchant?.shop || "Your Shop",
        date: order.date || order.createdAt?.toLocaleString('en-US', { timeZone: 'Asia/Qatar' }),
        amount: order.amount,
        currency: order.currency,
        remainingtime,
        paymentlink: decryptedLink
      }
    }
  };

  console.log('OneSignal expiry email payload:', JSON.stringify(payload, null, 2));
  try {
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${process.env.ONESIGNAL_REST_KEY}`
        }
      }
    );

    console.log(`✅ Expiry warning email sent to ${email} for order ${order.paylaterOrderId}`, response.data);
    return response.data;
  } catch (err) {
    console.error(`❌ Failed to send expiry warning email to ${email}:`, err.response?.data || err.message);
  }
};


export const sendCancellationEmail = async ({ email, fullname, order }) => {
  if (!email) return console.warn("No customer email provided, skipping cancellation email.");

  const payload = {
    app_id: process.env.ONESIGNAL_APP_ID,
    target_channel: "email",
    template_id: process.env.ONESIGNAL_CANCEL_TEMPLATE_ID,
    include_unsubscribed: true,
    include_email_tokens: [email],
    custom_data: {
      user: { fullname },
      order: {
        orderid: order.paylaterOrderId,
        merchantname: typeof order.merchant === "string" ? order.merchant : order.merchant?.shop || "Your Shop",
        date: order.date || order.createdAt?.toLocaleString('en-US', { timeZone: 'Asia/Qatar' }),
        amount: order.amount,
        currency: order.currency,
        remainingtime: 0,
        paymentlink: order.paymentLink || order.paymentlink,
        status: "CANCELLED"
      },
      message: "Your payment has been cancelled. No charges were made."
    }
  };

  console.log('OneSignal cancellation email payload:', JSON.stringify(payload, null, 2));


  try {
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${process.env.ONESIGNAL_REST_KEY}`
        }
      }
    );

    console.log(`✅ Cancellation email sent to ${email} for order ${order.paylaterOrderId}`, response.data);
    return response.data;
  } catch (err) {
    console.error(`❌ Failed to send cancellation email to ${email}:`, err.response?.data || err.message);
  }
};
