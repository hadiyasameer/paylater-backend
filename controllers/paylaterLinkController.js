import axios from "axios";
import { prisma, connectDb } from "../utils/db.js";
import { decrypt } from "../utils/encryption.js";

export const getPayLaterLink = async (req, res) => {
  try {
    const { shop, order_id, amount, customer_email } = req.query;

    if (!shop || !order_id || !amount || !customer_email) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    await connectDb();

    const merchant = await prisma.merchant.findFirst({
      where: { shop },
    });

    if (!merchant) {
      return res.status(404).json({ message: "Merchant not found" });
    }

    const decryptedApiKey = decrypt(merchant.paylaterApiKey);
    if (!decryptedApiKey) {
      return res.status(400).json({ message: "Merchant BNPL API key missing" });
    }

    const failRedirectUrl = `${process.env.SERVER_URL}/api/paylater/cancel?orderId=${order_id}`;
    const successRedirectUrl =
      merchant.successUrl || `${process.env.FRONTEND_URL}/pages/paylater-success`;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const payload = {
      merchantId: merchant.paylaterMerchantId,
      outletId: merchant.paylaterOutletId,
      currency: "QAR",
      amount: parsedAmount,
      orderId: order_id,
      successRedirectUrl,
      failRedirectUrl,
    };

    console.log("👉 Sending PayLater link request:", payload);

    const response = await axios.post(
      `${process.env.BNPL_BASE_URL}/api/paylater/merchant-portal/web-checkout/`,
      payload,
      {
        headers: {
          "x-api-key": decryptedApiKey,
          "Content-Type": "application/json",
        },
        timeout: 12000,
      }
    );

    const paymentUrl = response.data?.paymentLinkUrl;
    if (!paymentUrl) {
      return res
        .status(502)
        .json({ message: "Failed to generate PayLater link" });
    }

    return res.json({
      orderId: order_id,
      paymentUrl,
      message: "PayLater link generated successfully",
    });
  } catch (err) {
    console.error(
      "❌ Error generating PayLater link:",
      err.response?.data || err.message
    );
    return res.status(500).json({
      message: "Internal server error",
      error: err.response?.data || err.message,
    });
  }
};
