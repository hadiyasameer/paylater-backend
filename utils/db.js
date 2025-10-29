import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const connectDb = async () => {
  try {
    await prisma.$connect();
    console.log("✅ PostgreSQL connected successfully");
  } catch (err) {
    console.error("❌ PostgreSQL connection error:", err.message);
    process.exit(1);
  }
};

export { prisma };
