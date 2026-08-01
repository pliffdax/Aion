CREATE TYPE "TelegramLocale" AS ENUM ('RU', 'UK', 'EN');

CREATE TABLE "TelegramUser" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" VARCHAR(32),
    "firstName" VARCHAR(64),
    "locale" "TelegramLocale" NOT NULL DEFAULT 'RU',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyPlanItem" (
    "id" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "text" VARCHAR(160) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlanItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramUser_telegramId_key" ON "TelegramUser"("telegramId");
CREATE INDEX "TelegramUser_locale_idx" ON "TelegramUser"("locale");

CREATE UNIQUE INDEX "DailyPlan_userId_planDate_key" ON "DailyPlan"("userId", "planDate");
CREATE INDEX "DailyPlan_userId_idx" ON "DailyPlan"("userId");
CREATE INDEX "DailyPlan_planDate_idx" ON "DailyPlan"("planDate");

CREATE INDEX "DailyPlanItem_dailyPlanId_idx" ON "DailyPlanItem"("dailyPlanId");
CREATE INDEX "DailyPlanItem_dailyPlanId_position_idx" ON "DailyPlanItem"("dailyPlanId", "position");
CREATE INDEX "DailyPlanItem_dailyPlanId_completed_idx" ON "DailyPlanItem"("dailyPlanId", "completed");

ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyPlanItem" ADD CONSTRAINT "DailyPlanItem_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
