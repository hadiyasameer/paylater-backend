import express from 'express';
import { getPayLaterLink } from '../controllers/paylaterLinkController.js';

const router = express.Router();

// Example URL: /paylater-checkout?shop=myshop.myshopify.com&order_id=12345&amount=100&customer_email=test@example.com
router.get('/paylater-checkout', getPayLaterLink);

export default router;
