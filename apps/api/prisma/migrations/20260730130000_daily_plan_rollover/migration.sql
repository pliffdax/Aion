ALTER TABLE "DailyPlan"
ADD COLUMN "finalizedAt" TIMESTAMPTZ(3),
ADD COLUMN "rolloverCompletedAt" TIMESTAMPTZ(3),
ADD COLUMN "rolloverToken" VARCHAR(36),
ADD COLUMN "rolloverClaimedAt" TIMESTAMPTZ(3),
ADD COLUMN "rolloverAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "rolloverLastError" VARCHAR(500);

ALTER TABLE "DailyPlanItem"
ADD COLUMN "carriedFromItemId" TEXT;

CREATE UNIQUE INDEX "DailyPlan_rolloverToken_key"
ON "DailyPlan"("rolloverToken");

CREATE UNIQUE INDEX "DailyPlanItem_dailyPlanId_carriedFromItemId_key"
ON "DailyPlanItem"("dailyPlanId", "carriedFromItemId");

CREATE INDEX "DailyPlanItem_carriedFromItemId_idx"
ON "DailyPlanItem"("carriedFromItemId");

ALTER TABLE "DailyPlanItem"
ADD CONSTRAINT "DailyPlanItem_carriedFromItemId_fkey"
FOREIGN KEY ("carriedFromItemId") REFERENCES "DailyPlanItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
