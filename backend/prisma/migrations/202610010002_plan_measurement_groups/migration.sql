CREATE TABLE "PlanMeasurementGroup" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanMeasurementGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanMeasurementGroup_documentId_name_key"
  ON "PlanMeasurementGroup"("documentId", "name");
CREATE INDEX "PlanMeasurementGroup_documentId_createdAt_idx"
  ON "PlanMeasurementGroup"("documentId", "createdAt");
CREATE INDEX "PlanMeasurementGroup_createdBy_idx"
  ON "PlanMeasurementGroup"("createdBy");

ALTER TABLE "PlanMeasurementGroup"
  ADD CONSTRAINT "PlanMeasurementGroup_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanMeasurementGroup"
  ADD CONSTRAINT "PlanMeasurementGroup_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The deterministic id and unique document/name key make this backfill safe to rerun.
INSERT INTO "PlanMeasurementGroup" (
  "id", "documentId", "name", "createdBy", "createdAt", "updatedAt"
)
SELECT
  (md5('odan-plan-ungrouped:' || "documentId")::uuid)::text,
  "documentId",
  'Ungrouped',
  MIN("createdBy"),
  MIN("createdAt"),
  CURRENT_TIMESTAMP
FROM "PlanMeasurement"
GROUP BY "documentId"
ON CONFLICT ("documentId", "name") DO NOTHING;

ALTER TABLE "PlanMeasurement" ADD COLUMN "groupId" TEXT;

UPDATE "PlanMeasurement" AS measurement
SET "groupId" = measurement_group."id"
FROM "PlanMeasurementGroup" AS measurement_group
WHERE measurement."groupId" IS NULL
  AND measurement_group."documentId" = measurement."documentId"
  AND measurement_group."name" = 'Ungrouped';

ALTER TABLE "PlanMeasurement" ALTER COLUMN "groupId" SET NOT NULL;
CREATE INDEX "PlanMeasurement_groupId_createdAt_idx"
  ON "PlanMeasurement"("groupId", "createdAt");
ALTER TABLE "PlanMeasurement"
  ADD CONSTRAINT "PlanMeasurement_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "PlanMeasurementGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
