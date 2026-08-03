ALTER TABLE "DailyPlanItem"
ADD COLUMN "completedAt" TIMESTAMPTZ(3);

UPDATE "DailyPlanItem"
SET "completedAt" = "updatedAt" AT TIME ZONE 'UTC'
WHERE "completed" = true;
