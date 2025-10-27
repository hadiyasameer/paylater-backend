import mongoose from "mongoose";
import crypto from "crypto";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
const IV_LENGTH = 12;

export function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(data) {
  if (!data) return data;
  const [ivHex, tagHex, encryptedHex] = data.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
  return decrypted;
}

export const normalizeShopifyStatus = (status) => {
  if (!status) return "pending";
  const s = String(status).toLowerCase();
  if (["paid", "partially_paid"].includes(s)) return "paid";
  if (["voided", "refunded", "cancelled"].includes(s)) return "cancelled";
  if (s === "fulfilled") return "fulfilled";
  return "pending";
};

export const normalizePayLaterStatus = (status) => {
  if (!status) return "pending";
  const s = String(status).toLowerCase();
  if (["pending", "authorized"].includes(s)) return s;
  if (["paid"].includes(s)) return "paid";
  if (["failed", "cancelled"].includes(s)) return "failed";
  return "pending";
};

const orderSchema = new mongoose.Schema(
  {
    shopifyOrderId: { type: String, required: true, index: true },
    paylaterOrderId: { type: String, unique: true, maxlength: 255 },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    merchant: { type: String, required: true, index: true },
    shopifyStatus: { type: String, enum: ["pending", "paid", "fulfilled", "cancelled"], default: "pending" },
    paylaterStatus: { type: String, enum: ["pending", "authorized", "paid", "failed"], default: "pending" },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "QAR" },
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

    lastWebhookAt: { type: Date },
    lastWebhookId: { type: String }
  },
  { timestamps: true, toJSON: { getters: true, virtuals: true }, toObject: { getters: true, virtuals: true } }
);

orderSchema.index({ shopifyOrderId: 1, merchantId: 1 }, { unique: true });

orderSchema.methods.updateStatuses = async function ({
  shopifyStatus,
  paylaterStatus,
  transactionId,
  paymentDate,
  comments,
  webhookId,
  webhookTimestamp
}) {
  const update = {};
  if (shopifyStatus) update.shopifyStatus = normalizeShopifyStatus(shopifyStatus);
  if (paylaterStatus) update.paylaterStatus = normalizePayLaterStatus(paylaterStatus);
  if (transactionId) update.paylaterTransactionId = transactionId;
  if (paymentDate) update.paylaterPaymentDate = new Date(paymentDate);
  if (comments) update.paylaterComments = comments;

  if (webhookId && webhookTimestamp) {
    if (this.lastWebhookAt && new Date(webhookTimestamp) <= this.lastWebhookAt) {
      console.log(`ℹ️ Ignored stale webhook ${webhookId} for order ${this._id}`);
      return;
    }
    update.lastWebhookId = webhookId;
    update.lastWebhookAt = new Date(webhookTimestamp);
  }

  if (Object.keys(update).length > 0) {
    await mongoose.models.Order.findOneAndUpdate({ _id: this._id }, { $set: update }, { new: true });
  }
};

orderSchema.methods.autoCancel = async function (merchant) {
  try {
    const { shop, accessToken } = merchant?.getDecryptedData?.() || {
      shop: this.shopDomain,
      accessToken: decrypt(this.accessToken),
    };

    const update = { cancelled: true };
    if (this.paylaterStatus !== "paid") {
      update.shopifyStatus = "cancelled";
      update.paylaterStatus = "failed";
    }

    await mongoose.models.Order.updateOne({ _id: this._id }, { $set: update });

    if (!shop || !accessToken || !this.shopifyOrderId) return;

    await axios.post(
      `https://${shop}/admin/api/2025-10/orders/${this.shopifyOrderId}/cancel.json`,
      { transaction: { kind: "void", status: "success" } },
      { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" }, timeout: 10000 }
    );

    console.log(`🛑 Shopify order ${this.shopifyOrderId} cancelled successfully.`);
  } catch (err) {
    console.error(`❌ Failed to auto-cancel Shopify order ${this.shopifyOrderId}:`, err.response?.data || err.message);
  }
};

export const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
