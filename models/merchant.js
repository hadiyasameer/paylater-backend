import mongoose from "mongoose";

const merchantSchema = new mongoose.Schema({
  shop: { type: String, unique: true, required: true },
  accessToken: { type: String, required: true },          
  paylaterMerchantId: { type: String, required: true },
  paylaterOutletId: { type: String, required: true },
  webhookSecret: { type: String, required: true },
  successUrl: { type: String, default: "" },
  failUrl: { type: String, default: "" },
  installedAt: { type: Date, default: Date.now }
});


export const Merchant = mongoose.models.Merchant || mongoose.model("Merchant", merchantSchema);
