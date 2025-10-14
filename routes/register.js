import express from "express";
import { Merchant } from "../models/merchant.js";
import { connectDb } from "../utils/db.js";
import { isValidShopDomain } from "../utils/shopifyUtils.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    await connectDb();
    const { shop, accessToken, paylaterMerchantId, paylaterOutletId, webhookSecret } = req.body;

    if (!shop || !accessToken || !paylaterMerchantId || !paylaterOutletId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!isValidShopDomain(shop)) {
      return res.status(400).json({ message: "Invalid Shopify shop domain" });
    }

    let merchant = await Merchant.findOne({ shop });
    if (merchant) {
      return res.status(400).json({ message: "Shop already registered" });
    }

    merchant = new Merchant({ shop, accessToken, paylaterMerchantId, paylaterOutletId, webhookSecret });
    await merchant.save();

    res.json({ success: true, message: "Merchant registered successfully" });

  } catch (err) {
    console.error("Error registering merchant:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
});

export default router;
