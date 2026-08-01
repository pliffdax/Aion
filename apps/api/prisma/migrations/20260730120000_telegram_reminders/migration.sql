CREATE TYPE "TelegramReminderStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'SENT',
    'CANCELLED',
    'FAILED'
);

CREATE TABLE "TelegramReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "remindAt" TIMESTAMPTZ(3) NOT NULL,
    "availableAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "status" "TelegramReminderStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryToken" VARCHAR(36),
    "claimedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramReminder_deliveryToken_key"
ON "TelegramReminder"("deliveryToken");

CREATE INDEX "TelegramReminder_userId_status_remindAt_idx"
ON "TelegramReminder"("userId", "status", "remindAt");

CREATE INDEX "TelegramReminder_status_availableAt_idx"
ON "TelegramReminder"("status", "availableAt");

CREATE INDEX "TelegramReminder_claimedAt_idx"
ON "TelegramReminder"("claimedAt");

ALTER TABLE "TelegramReminder"
ADD CONSTRAINT "TelegramReminder_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "TelegramUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
