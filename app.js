import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bnplRoutes from './routes/bnplRoutes.js';
import paylaterStaticRoute from './routes/staticPayLink.js';
import paylaterWebhook from './webhooks/bnplWebhook.js';
import shopifyWebhook from './webhooks/shopifyWebhook.js'; 

dotenv.config();
const app = express();
app.use(cors())

app.use(express.json());

app.use('/api/bnpl', bnplRoutes);
app.use('/', paylaterStaticRoute);
app.use('/api/webhooks/paylater', paylaterWebhook);
app.use('/api/webhooks/shopify', shopifyWebhook);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
