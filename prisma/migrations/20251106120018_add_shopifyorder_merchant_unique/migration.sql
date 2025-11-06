/*
  Warnings:

  - A unique constraint covering the columns `[shopifyOrderId,merchantId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Order_shopifyOrderId_merchantId_key" ON "Order"("shopifyOrderId", "merchantId");
