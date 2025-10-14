import mongoose from "mongoose";

const merchantSchema = new mongoose.Schema({
  shop: { type: String, unique: true },
  accessToken: String,
  paylaterMerchantId: String,
  paylaterOutletId: String,
  webhookSecret: String,
  installedAt: { type: Date, default: Date.now },
});

export const Merchant = mongoose.models.Merchant || mongoose.model("Merchant", merchantSchema);
