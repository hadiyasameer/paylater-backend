import axios from "axios";

export const sendPayLaterEmail = async ({ email, fullname, order, cancelTimeLimit }) => {
  if (!email) return console.warn("No customer email provided, skipping email.");

  const shopName = order.merchant || "Your Shop";
  const timeLimit = cancelTimeLimit || order.cancelTimeLimit || 10;
  const paymentLink = order.paymentLink || order.paymentlink;

  try {
    const payload = {
      app_id: process.env.ONESIGNAL_APP_ID,
      target_channel: "email",
      template_id: process.env.ONESIGNAL_TEMPLATE_ID,
      include_unsubscribed: true,
      include_email_tokens: [email],
      custom_data: {
        fullname: fullname || email,
        shopName,
        orderNumber: order.paylaterOrderId,
        orderDate: order.date.toLocaleString(),
        amount: order.amount,
        currency: order.currency,
        paymentLink,
        timeLimit,
      },
    };

    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      payload,
      { headers: { "Content-Type": "application/json", Authorization: `Basic ${process.env.ONESIGNAL_REST_KEY}` } }
    );

    console.log(`✅ Payment link email sent to ${email} for order ${order.paylaterOrderId}`, response.data);
    return response.data;
  } catch (err) {
    console.error(`❌ Failed to send email to ${email} for order ${order.paylaterOrderId}:`, err.response?.data || err.message);
  }
};

export const sendExpiryWarningEmail = async ({ email, fullname, order, cancelTimeLimit }) => {
  if (!email) return console.warn("No email provided, skipping expiry warning.");

  const shopName = order.merchant || "Your Shop";
  const timeLimit = cancelTimeLimit || order.cancelTimeLimit || 10;
  const paymentLink = order.paymentLink || order.paymentlink;

  try {
    const payload = {
      app_id: process.env.ONESIGNAL_APP_ID,
      target_channel: "email",
      template_id: process.env.ONESIGNAL_TEMPLATE_ID,
      include_unsubscribed: true,
      include_email_tokens: [email],
      custom_data: {
        fullname: fullname || email,
        shopName,
        orderNumber: order.paylaterOrderId,
        orderDate: order.date.toLocaleString(),
        amount: order.amount,
        currency: order.currency,
        paymentLink,
        timeLimit,
      },
    };

    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      payload,
      { headers: { "Content-Type": "application/json", Authorization: `Basic ${process.env.ONESIGNAL_REST_KEY}` } }
    );

    console.log(`✅ Expiry warning email sent to ${email} for order ${order.paylaterOrderId}`, response.data);
    return response.data;
  } catch (err) {
    console.error(`❌ Failed to send expiry warning email to ${email} for order ${order.paylaterOrderId}:`, err.response?.data || err.message);
  }
};

export const sendCancellationEmail = async ({ email, fullname, order }) => {
  if (!email) return console.warn("No customer email provided, skipping cancellation email.");

  const shopName = order.merchant || "Your Shop";
  const paymentLink = order.paymentLink || order.paymentlink;

  try {
    const payload = {
      app_id: process.env.ONESIGNAL_APP_ID,
      target_channel: "email",
      template_id: process.env.ONESIGNAL_TEMPLATE_ID,
      include_unsubscribed: true,
      include_email_tokens: [email],
      custom_data: {
        fullname: fullname || email,
        shopName,
        orderNumber: order.paylaterOrderId,
        orderDate: order.date.toLocaleString(),
        amount: order.amount,
        currency: order.currency,
        paymentLink,
        status: "CANCELLED",
      },
    };

    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      payload,
      { headers: { "Content-Type": "application/json", Authorization: `Basic ${process.env.ONESIGNAL_REST_KEY}` } }
    );

    console.log(`✅ Cancellation email sent to ${email} for order ${order.paylaterOrderId}`, response.data);
    return response.data;
  } catch (err) {
    console.error(`❌ Failed to send cancellation email to ${email} for order ${order.paylaterOrderId}:`, err.response?.data || err.message);
  }
};
