import express from "express";
import { prisma, connectDb } from "../utils/db.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import { isValidShopDomain } from "../utils/shopifyUtils.js";

const router = express.Router();

router.post("/", async (req, res) => {
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

    if (
      !shop ||
      !accessToken ||
      !paylaterMerchantId ||
      !paylaterOutletId ||
      !paylaterApiKey ||
      !webhookSecret
    ) {
      return res.status(400).json({
        message:
          "Missing required fields. Make sure paylaterApiKey is included.",
      });
    }

    if (!isValidShopDomain(shop)) {
      return res
        .status(400)
        .json({ message: "Invalid Shopify shop domain" });
    }

    const existingMerchant = await prisma.merchant.findFirst({
      where: { shop },
    });
    if (existingMerchant) {
      return res.status(400).json({ message: "Shop already registered" });
    }

    const encryptedData = {
      shop,
      accessToken: encrypt(accessToken),
      paylaterMerchantId,
      paylaterOutletId,
      paylaterApiKey: encrypt(paylaterApiKey),
      webhookSecret: encrypt(webhookSecret),
    };

    const merchant = await prisma.merchant.create({
      data: encryptedData,
    });

    res.json({
      success: true,
      message: "Merchant registered successfully",
      data: {
        ...merchant,
        accessToken: decrypt(merchant.accessToken),
        paylaterApiKey: decrypt(merchant.paylaterApiKey),
        webhookSecret: decrypt(merchant.webhookSecret),
      },
    });
  } catch (err) {
    console.error("❌ Error registering merchant:", err);
    res.status(500).json({
      message: "Internal server error",
      error: err.message,
    });
  }
});

router.post("/update-cancel-time", async (req, res) => {
  try {
    await connectDb();
    const { shop, cancelTimeLimit } = req.body;

    if (!shop || cancelTimeLimit === undefined || isNaN(cancelTimeLimit)) {
      return res
        .status(400)
        .json({ error: "shop and numeric cancelTimeLimit are required" });
    }

    const updatedMerchant = await prisma.merchant.updateMany({
      where: { shop },
      data: { cancelTimeLimit: parseInt(cancelTimeLimit) },
    });

    if (updatedMerchant.count === 0) {
      return res.status(404).json({ error: "Merchant not found" });
    }

    const merchant = await prisma.merchant.findFirst({ where: { shop } });

    res.json({
      message: "Cancel time limit updated successfully",
      merchant: {
        ...merchant,
        accessToken: decrypt(merchant.accessToken),
        paylaterApiKey: merchant.paylaterApiKey
          ? decrypt(merchant.paylaterApiKey)
          : null,
        webhookSecret: decrypt(merchant.webhookSecret),
      },
    });
  } catch (error) {
    console.error("❌ Error updating cancel time:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
