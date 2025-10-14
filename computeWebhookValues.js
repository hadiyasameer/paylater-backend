import crypto from "crypto";

// Replace these values with your test data
const merchantId = "138";
const orderId = "TEST123-1697338981234";
const status = "success";
const timestamp = "1697338981234";
const comments = "Paid via Postman";
const webhookSecret = "mysecret123"; // your merchant webhookSecret

// Step 1: Compute txHash
const dataString = (merchantId + orderId + status + timestamp + comments).toUpperCase();
const txHash = crypto.createHash("md5").update(dataString).digest("hex");

// Step 2: Compute signature
const signature = crypto.createHmac("sha256", webhookSecret).update(txHash).digest("hex");

console.log("txHash:", txHash);
console.log("signature:", signature);
