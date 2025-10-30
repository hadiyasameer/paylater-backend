-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "paylaterMerchantId" TEXT NOT NULL,
    "paylaterOutletId" TEXT NOT NULL,
    "paylaterApiKey" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "successUrl" TEXT NOT NULL DEFAULT '',
    "failUrl" TEXT NOT NULL DEFAULT '',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelTimeLimit" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "paylaterOrderId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "shopifyStatus" TEXT NOT NULL DEFAULT 'pending',
    "paylaterStatus" TEXT NOT NULL DEFAULT 'pending',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "paymentLink" TEXT,
    "paylaterTransactionId" TEXT,
    "paylaterPaymentDate" TIMESTAMP(3),
    "paylaterComments" TEXT,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "shopDomain" TEXT,
    "accessToken" TEXT,
    "cancelTimeLimit" INTEGER NOT NULL DEFAULT 10,
    "warningSent" BOOLEAN NOT NULL DEFAULT false,
    "halfTimeReminderSent" BOOLEAN NOT NULL DEFAULT false,
    "cancelEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "lastWebhookAt" TIMESTAMP(3),
    "lastWebhookId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_shop_key" ON "Merchant"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Order_paylaterOrderId_key" ON "Order"("paylaterOrderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
