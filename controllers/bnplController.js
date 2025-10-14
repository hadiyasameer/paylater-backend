import axios from 'axios';

export const createBnplOrder = async (req, res) => {
  try {
    const {
      orderId,
      amount,
      successRedirectUrl,
      failRedirectUrl,
      paylaterMerchantId,
      outletId
    } = req.body;

    // Validate required fields
    if (!orderId || !amount || !successRedirectUrl || !failRedirectUrl || !paylaterMerchantId || !outletId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Validate amount is a positive number
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // Make orderId unique by appending timestamp
    const uniqueOrderId = `${orderId}-${Date.now()}`;

    const payload = {
      merchantId: paylaterMerchantId,
      outletId,
      currency: "QAR",
      amount: parsedAmount,
      orderId: uniqueOrderId,
      successRedirectUrl,
      failRedirectUrl
    };

    console.log("👉 Sending PayLater request:", payload);

    const response = await axios.post(
      `${process.env.BNPL_BASE_URL}/api/paylater/merchant-portal/web-checkout/`,
      payload,
      {
        headers: {
          'x-api-key': process.env.BNPL_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("✅ PayLater API response:", response.data);

    return res.json({ paymentUrl: response.data.paymentLinkUrl });

  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error("❌ Error creating BNPL order:", {
      message: errorMsg,
      status: err.response?.status,
      data: err.response?.data
    });

    // Handle duplicate order ID
    if (errorMsg.includes("Order ID already exists")) {
      const existingLink = err.response?.data?.paymentLinkUrl;
      return res.json({ paymentUrl: existingLink || `${req.body.successRedirectUrl}?orderId=${req.body.orderId}` });
    }

    return res.status(500).json({
      message: "Failed to create PayLater order",
      error: err.response?.data || err.message
    });
  }
};
