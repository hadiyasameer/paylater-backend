export const normalizeShopifyStatus = (status) => {
  if (!status) return "pending";
  const s = status.toString().trim().toLowerCase();

  if (["paid", "partially_paid"].includes(s)) return "paid";
  if (["voided", "refunded", "cancelled", "failed"].includes(s)) return "cancelled";
  if (["fulfilled"].includes(s)) return "fulfilled";
  if (["authorized"].includes(s)) return "authorized";

  return "pending";
};


export const normalizePayLaterStatus = (status) => {
  if (!status) return "pending";
  const s = status.toString().trim().toLowerCase();

  if (["success", "paid", "completed"].includes(s)) return "paid";
  if (["failed", "cancelled", "error"].includes(s)) return "failed";

  return "pending";
};
