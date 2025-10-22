import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { connectDb } from './utils/db.js';
import bnplRoutes from './routes/bnplRoutes.js';
import paylaterStaticRoute from './routes/staticPayLink.js';
import paylaterWebhook from './webhooks/bnplWebhook.js';
import shopifyWebhook from './webhooks/shopifyWebhook.js';
import merchantRoutes from './routes/register.js';
import "./jobs/orderScheduler.js";

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL }));

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

connectDb()
  .then(() => {
    console.log('✅ Scheduler connected to MongoDB');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

app.use('/api/bnpl', bnplRoutes);
app.use('/api/paylater', paylaterStaticRoute);
app.use('/api/webhooks/paylater', paylaterWebhook);
app.use('/api/webhooks/shopify', shopifyWebhook);
app.use('/api/merchants', merchantRoutes);

app.use('/api/orders',bnplRoutes)

app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
