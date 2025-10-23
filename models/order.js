import mongoose from "mongoose";
import { encrypt, decrypt } from "../utils/encryption.js";
import axios from "axios";

const orderSchema = new mongoose.Schema(
  {
    shopifyOrderId: { type: String, required: true, index: true },
    paylaterOrderId: { type: String, unique: true, maxlength: 255 },
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
      index: true,
    },
    merchant: { type: String, required: true, index: true },

    shopifyStatus: {
      type: String,
      enum: ["pending", "paid", "fulfilled", "cancelled"],
      default: "pending",
    },
    paylaterStatus: {
      type: String,
      enum: ["pending", "authorized", "paid", "failed"],
      default: "pending",
    },

    amount: { type: Number, required: true },
    currency: { type: String, default: "QAR" },

    paymentLink: { type: String, set: encrypt, get: decrypt },
    paylaterTransactionId: { type: String, set: encrypt, get: decrypt },
    paylaterPaymentDate: { type: Date },
    paylaterComments: { type: String },

    customerEmail: { type: String },
    customerName: { type: String },

    shopDomain: { type: String },
    accessToken: { type: String },

    cancelTimeLimit: { type: Number, default: 10 },

    warningSent: { type: Boolean, default: false },
    halfTimeReminderSent: { type: Boolean, default: false },
    cancelEmailSent: { type: Boolean, default: false },
    cancelled: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { getters: true, virtuals: true },
  }
);

orderSchema.index({ shopifyOrderId: 1, merchantId: 1 }, { unique: true });

orderSchema.methods.updateStatuses = async function ({
  shopifyStatus,
  paylaterStatus,
  transactionId,
  paymentDate,
  comments,
}) {
  if (shopifyStatus) this.shopifyStatus = shopifyStatus;
  if (paylaterStatus) this.paylaterStatus = paylaterStatus;
  if (transactionId) this.paylaterTransactionId = transactionId;
  if (paymentDate) this.paylaterPaymentDate = new Date(paymentDate);
  if (comments) this.paylaterComments = comments;
  await this.save();
};

orderSchema.methods.autoCancel = async function (merchant) {
  try {
    if (!merchant) {
      console.warn(`❌ Merchant not provided for auto-cancel of order ${this._id}`);
      return;
    }

    const { shop, accessToken } = merchant.getDecryptedData
      ? merchant.getDecryptedData()
      : { shop: this.shopDomain, accessToken: decrypt(this.accessToken) };

    this.shopifyStatus = "cancelled";
    this.paylaterStatus = "failed";
    this.cancelled = true;
    await this.save();

    if (shop && accessToken && this.shopifyOrderId) {
      await axios.post(
        `https://${shop}/admin/api/2025-10/orders/${this.shopifyOrderId}/cancel.json`,
        {
          transaction: {
            kind: "void",
            status: "success",
          },
        },
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(`💳 Payment voided for Shopify order ${this.shopifyOrderId}.`);

      await axios.post(
        `https://${shop}/admin/api/2025-10/orders/${this.shopifyOrderId}/cancel.json`,
        {},
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(`🛑 Shopify order ${this.shopifyOrderId} cancelled successfully.`);
    }
  } catch (err) {
    console.error(
      `❌ Failed to auto-cancel Shopify order ${this.shopifyOrderId}:`,
      err.response?.data || err.message
    );
  }
};

export const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
