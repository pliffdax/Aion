ALTER TABLE "TelegramReport"
ADD COLUMN "answers" JSONB,
ADD COLUMN "configuration" JSONB,
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "TelegramReportRevision" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "answers" JSONB,
    "configuration" JSONB,
    "telegramMessageId" BIGINT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramReportRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramReportRevision_reportId_revision_key"
ON "TelegramReportRevision"("reportId", "revision");

CREATE INDEX "TelegramReportRevision_reportId_createdAt_idx"
ON "TelegramReportRevision"("reportId", "createdAt");

ALTER TABLE "TelegramReportRevision"
ADD CONSTRAINT "TelegramReportRevision_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "TelegramReport"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
