// backend/routes/auth.js
import express from 'express';
import axios from 'axios';
import { createManualPayment } from '../shopify.js'; 

const router = express.Router();

router.get('/auth/callback', async (req, res) => {
  const { code, shop } = req.query;

  if (!code || !shop) {
    return res.status(400).send('Missing code or shop query parameter.');
  }

  try {
    // Exchange code for access token
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    });

    const accessToken = response.data.access_token;

    // Create the PayLater manual payment method
    await createManualPayment(shop, accessToken);

    // Redirect merchant to a success page
    res.redirect('/success'); // you can make a simple HTML page
  } catch (err) {
    console.error(err);
    res.status(500).send('Error during OAuth callback');
  }
});

export default router;
