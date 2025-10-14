// backend/shopify.js
import axios from 'axios';

export async function createManualPayment(store, accessToken) {
  const url = `https://${store}/admin/api/2025-07/payment_gateways.json`;

  const data = {
    payment_gateway: {
      name: "PayLater",
      type: "manual",
      admin_only: false,
      enabled: true
    }
  };

  const response = await axios.post(url, data, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  console.log('Manual payment created:', response.data);
}
