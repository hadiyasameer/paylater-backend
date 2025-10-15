import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  shopifyOrderId: { type: String, required: true, index: true },
  paylaterOrderId: { type: String, required: true, unique: true },
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
  status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
  amount: { type: Number, required: true },
  currency: { type: String, default: "QAR" },
  paymentLink: { type: String, required: true }
}, { timestamps: true }); 
orderSchema.index({ shopifyOrderId: 1, merchantId: 1 }, { unique: true }); 


export const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
