import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDb, prisma } from "./utils/db.js";
import bnplRoutes from "./routes/bnplRoutes.js";
import paylaterStaticRoute from "./routes/staticPayLink.js";
import paylaterWebhook from "./webhooks/bnplWebhook.js";
import shopifyWebhook from "./webhooks/shopifyWebhook.js";
import merchantRoutes from "./routes/register.js";
import "./jobs/orderScheduler.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin === process.env.FRONTEND_URL) return callback(null, true);
      return callback(new Error("CORS policy: Origin not allowed"));
    },
    credentials: true,
  })
);

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

connectDb()
  .then(() => console.log("✅ Connected to PostgreSQL database successfully"))
  .catch((err) => {
    console.error("❌ PostgreSQL connection failed:", err.message);
    process.exit(1);
  });

app.use("/api/bnpl", bnplRoutes);
app.use("/api/orders", bnplRoutes);
app.use("/api/paylater", paylaterStaticRoute);
app.use("/api/webhooks/paylater", paylaterWebhook);
app.use("/api/webhooks/shopify", shopifyWebhook);
app.use("/api/merchants", merchantRoutes);

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "OK", db: "connected", timestamp: new Date() });
  } catch {
    res.status(500).json({ status: "FAILED", db: "disconnected", timestamp: new Date() });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
});
