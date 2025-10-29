import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log("🔍 Testing PostgreSQL connection...");
    await prisma.$connect();
    console.log("✅ Connected to PostgreSQL successfully!");
  } catch (err) {
    console.error("❌ Connection failed:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
