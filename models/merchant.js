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
  installedAt: { type: Date, default: Date.now },
  cancelTimeLimit: { type: Number, default: 10 },
});

merchantSchema.pre("save", function (next) {
  if (this.isModified("accessToken") && !this.accessToken.includes(':')) {
    this.accessToken = encrypt(this.accessToken);
  }
  if (this.isModified("webhookSecret") && !this.webhookSecret.includes(':')) {
    this.webhookSecret = encrypt(this.webhookSecret);
  }
  next();
});


merchantSchema.methods.getDecryptedData = function () {
  return {
    shop: this.shop,
    accessToken: decrypt(this.accessToken),
    webhookSecret: decrypt(this.webhookSecret),
    successUrl: this.successUrl,
    failUrl: this.failUrl,
    installedAt: this.installedAt,
    cancelTimeLimit: this.cancelTimeLimit, 
  };
};

export const Merchant = mongoose.models.Merchant || mongoose.model("Merchant", merchantSchema);
