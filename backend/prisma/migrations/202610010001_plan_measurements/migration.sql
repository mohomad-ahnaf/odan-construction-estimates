CREATE TYPE "MeasurementType" AS ENUM ('LENGTH', 'AREA', 'COUNT');

CREATE TABLE "PageCalibration" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "pageWidth" DOUBLE PRECISION NOT NULL,
  "pageHeight" DOUBLE PRECISION NOT NULL,
  "referenceGeometry" JSONB NOT NULL,
  "referenceLengthMeters" DECIMAL(24,10) NOT NULL,
  "referenceUnit" TEXT NOT NULL,
  "checkReferenceGeometry" JSONB,
  "checkReferenceLengthMeters" DECIMAL(24,10),
  "createdBy" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PageCalibration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanMeasurement" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "pageWidth" DOUBLE PRECISION NOT NULL,
  "pageHeight" DOUBLE PRECISION NOT NULL,
  "type" "MeasurementType" NOT NULL,
  "label" TEXT NOT NULL,
  "geometry" JSONB NOT NULL,
  "quantity" DECIMAL(24,10) NOT NULL,
  "unit" TEXT NOT NULL,
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanMeasurement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageCalibration_documentId_pageNumber_key"
  ON "PageCalibration"("documentId", "pageNumber");
CREATE INDEX "PageCalibration_createdBy_idx" ON "PageCalibration"("createdBy");
CREATE INDEX "PlanMeasurement_documentId_pageNumber_createdAt_idx"
  ON "PlanMeasurement"("documentId", "pageNumber", "createdAt");
CREATE INDEX "PlanMeasurement_createdBy_idx" ON "PlanMeasurement"("createdBy");

ALTER TABLE "PageCalibration"
  ADD CONSTRAINT "PageCalibration_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageCalibration"
  ADD CONSTRAINT "PageCalibration_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanMeasurement"
  ADD CONSTRAINT "PlanMeasurement_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanMeasurement"
  ADD CONSTRAINT "PlanMeasurement_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
