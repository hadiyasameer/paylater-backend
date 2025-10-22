import mongoose from "mongoose";
import { encrypt, decrypt } from "../utils/encryption.js";

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

merchantSchema.pre("save", function(next) {
  if (this.isModified("accessToken")) this.accessToken = encrypt(this.accessToken);
  if (this.isModified("webhookSecret")) this.webhookSecret = encrypt(this.webhookSecret);
  next();
});

merchantSchema.methods.getDecryptedData = function() {
  return {
    shop: this.shop,
    accessToken: decrypt(this.accessToken),
    webhookSecret: decrypt(this.webhookSecret),
    successUrl: this.successUrl,
    failUrl: this.failUrl,
    installedAt: this.installedAt
  };
};

export const Merchant = mongoose.models.Merchant || mongoose.model("Merchant", merchantSchema);
