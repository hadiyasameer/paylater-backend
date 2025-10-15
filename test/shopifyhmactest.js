import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const secret = process.env.SHOPIFY_API_SECRET; 

const body = '{"id":123456789,"email":"customer@example.com","total_price":"2500.00","currency":"QAR","payment_gateway_names":["paylater"]}';

const generatedHmac = crypto
  .createHmac("sha256", secret)
  .update(body, "utf8")
  .digest("base64");

console.log(generatedHmac);
