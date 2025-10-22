import crypto from "crypto";

const merchantId = "138";
const orderId = "ORDER1001";
const status = "success";
const comments = "Paid via Postman";
const webhookSecret = "mysecret123";

const timestamp = Date.now().toString(); 

const dataString = (merchantId + orderId + status + timestamp + comments).toUpperCase();
const txHash = crypto.createHash("md5").update(dataString).digest("hex");
const signature = crypto.createHmac("sha256", webhookSecret).update(txHash).digest("hex");

console.log({ merchantId, orderId, status, timestamp, comments, txHash, signature });
