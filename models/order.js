import mongoose from "mongoose";
import { encrypt, decrypt } from "../utils/encryption.js";

const orderSchema = new mongoose.Schema({
  shopifyOrderId: { type: String, required: true, index: true },
  paylaterOrderId: { type: String, required: true, unique: true, set: encrypt, get: decrypt },
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },

  shopifyStatus: { 
    type: String, 
    enum: ["pending", "paid", "fulfilled", "cancelled"], 
    default: "pending" 
  },
  paylaterStatus: { 
    type: String, 
    enum: ["pending", "authorized", "paid", "failed"], 
    default: "pending" 
  },

  amount: { type: Number, required: true },
  currency: { type: String, default: "QAR" },

  paymentLink: { type: String, required: true, set: encrypt, get: decrypt },
  paylaterTransactionId: { type: String, set: encrypt, get: decrypt },
  paylaterPaymentDate: { type: Date },
  paylaterComments: { type: String },
}, { 
  timestamps: true,
  toJSON: { getters: true }, 
  toObject: { getters: true } 
});

orderSchema.index({ shopifyOrderId: 1, merchantId: 1 }, { unique: true });

orderSchema.methods.updateStatuses = async function({ shopifyStatus, paylaterStatus, transactionId, paymentDate, comments }) {
  if (shopifyStatus) this.shopifyStatus = shopifyStatus;
  if (paylaterStatus) this.paylaterStatus = paylaterStatus;
  if (transactionId) this.paylaterTransactionId = transactionId;
  if (paymentDate) this.paylaterPaymentDate = new Date(paymentDate);
  if (comments) this.paylaterComments = comments;
  await this.save();
};

export const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
