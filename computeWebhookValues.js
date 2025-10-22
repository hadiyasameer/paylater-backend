import crypto from "crypto";

const merchantId = "136";
const orderId = "PL988009";
const status = "success";
const comments = "";
const webhookSecret = "b5defd18-c679-4d5e-b733-3d8a0ebf0075"; 
const timestamp = Date.now();

const dataString = (merchantId + orderId + status + timestamp + comments).toUpperCase();
const txHash = crypto.createHash("md5").update(dataString).digest("hex");

const signature = crypto.createHmac("sha256", webhookSecret)
                        .update(txHash)
                        .digest("hex");

console.log(JSON.stringify({
  merchantId,
  orderId,
  status,
  timestamp,
  comments,
  txHash,
  signature
}, null, 2));
