ALTER TYPE "TelegramReportType" ADD VALUE IF NOT EXISTS 'WEEKLY_STATISTICS';

ALTER TABLE "DailyPlanItem"
ADD COLUMN "carryCount" INTEGER NOT NULL DEFAULT 0;

WITH RECURSIVE "ItemCarryDepth" AS (
    SELECT "id", 0 AS "depth"
    FROM "DailyPlanItem"
    WHERE "carriedFromItemId" IS NULL

    UNION ALL

    SELECT child."id", parent."depth" + 1
    FROM "DailyPlanItem" child
    INNER JOIN "ItemCarryDepth" parent
        ON child."carriedFromItemId" = parent."id"
)
UPDATE "DailyPlanItem" item
SET "carryCount" = depth."depth"
FROM "ItemCarryDepth" depth
WHERE item."id" = depth."id";
