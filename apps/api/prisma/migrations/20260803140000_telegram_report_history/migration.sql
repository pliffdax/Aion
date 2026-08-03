CREATE TYPE "TelegramReportType" AS ENUM ('DAILY', 'WEEKLY');
CREATE TYPE "TelegramReportDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "TelegramReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TelegramReportType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "deliveryStatus" "TelegramReportDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryToken" VARCHAR(36),
    "claimedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "telegramMessageId" BIGINT,
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramReport_userId_type_periodStart_periodEnd_key"
ON "TelegramReport"("userId", "type", "periodStart", "periodEnd");

CREATE UNIQUE INDEX "TelegramReport_deliveryToken_key"
ON "TelegramReport"("deliveryToken");

CREATE INDEX "TelegramReport_userId_deliveryStatus_createdAt_idx"
ON "TelegramReport"("userId", "deliveryStatus", "createdAt");

CREATE INDEX "TelegramReport_userId_type_periodStart_idx"
ON "TelegramReport"("userId", "type", "periodStart");

CREATE INDEX "TelegramReport_deliveryStatus_claimedAt_idx"
ON "TelegramReport"("deliveryStatus", "claimedAt");

ALTER TABLE "TelegramReport"
ADD CONSTRAINT "TelegramReport_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
