import express from 'express';
import { Merchant } from '../models/merchant.js';
import { connectDb } from '../utils/db.js';
import { isValidShopDomain } from '../utils/shopifyUtils.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    await connectDb();

    const {
      shop,
      accessToken,
      paylaterMerchantId,
      paylaterOutletId,
      paylaterApiKey,
      webhookSecret,
    } = req.body;

    if (!shop || !accessToken || !paylaterMerchantId || !paylaterOutletId || !paylaterApiKey || !webhookSecret) {
      return res.status(400).json({
        message: 'Missing required fields. Make sure paylaterApiKey is included.'
      });
    }

    if (!isValidShopDomain(shop)) {
      return res.status(400).json({ message: 'Invalid Shopify shop domain' });
    }

    let merchant = await Merchant.findOne({ shop });
    if (merchant) {
      return res.status(400).json({ message: 'Shop already registered' });
    }

    merchant = new Merchant({
      shop,
      accessToken,
      paylaterMerchantId,
      paylaterOutletId,
      paylaterApiKey,
      webhookSecret
    });
    await merchant.save();

    res.json({
      success: true,
      message: 'Merchant registered successfully',
      data: merchant
    });

  } catch (err) {
    console.error('❌ Error registering merchant:', err);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});


router.post("/update-cancel-time", async (req, res) => {
  try {
    await connectDb();
    const { shop, cancelTimeLimit } = req.body;

    if (!shop || cancelTimeLimit === undefined || isNaN(cancelTimeLimit)) {
      return res.status(400).json({ error: "shop and numeric cancelTimeLimit are required" });
    }


    const merchant = await Merchant.findOneAndUpdate(
      { shop },
      { cancelTimeLimit },
      { new: true }
    );

    if (!merchant) return res.status(404).json({ error: "Merchant not found" });

    res.json({ message: "Cancel time limit updated successfully", merchant });
  } catch (error) {
    console.error("Error updating cancel time:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;


