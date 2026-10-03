CREATE TYPE "BuildingReviewStatus" AS ENUM ('DRAFT', 'REVIEWED');
CREATE TYPE "BuildingLengthSource" AS ENUM ('TRACED', 'OVERRIDE');
CREATE TYPE "BuildingFaceSide" AS ENUM ('A', 'B');
CREATE TYPE "BuildingOpeningType" AS ENUM ('DOOR', 'WINDOW');
CREATE TYPE "BuildingWallEnd" AS ENUM ('START', 'END');

CREATE TABLE "BuildingModel" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "status" "BuildingReviewStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuildingModel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuildingModel_projectId_key" ON "BuildingModel"("projectId");
ALTER TABLE "BuildingModel" ADD CONSTRAINT "BuildingModel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuildingModel" ADD CONSTRAINT "BuildingModel_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BuildingLevel" (
  "id" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Level 1',
  "documentId" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "pageWidth" DOUBLE PRECISION NOT NULL,
  "pageHeight" DOUBLE PRECISION NOT NULL,
  "calibrationSnapshot" JSONB NOT NULL,
  "originPageX" DOUBLE PRECISION NOT NULL,
  "originPageY" DOUBLE PRECISION NOT NULL,
  "orientationRadians" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuildingLevel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuildingLevel_modelId_key" ON "BuildingLevel"("modelId");
CREATE INDEX "BuildingLevel_documentId_pageNumber_idx" ON "BuildingLevel"("documentId", "pageNumber");
ALTER TABLE "BuildingLevel" ADD CONSTRAINT "BuildingLevel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "BuildingModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuildingLevel" ADD CONSTRAINT "BuildingLevel_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BuildingWall" (
  "id" TEXT NOT NULL,
  "levelId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "startX" DOUBLE PRECISION NOT NULL,
  "startY" DOUBLE PRECISION NOT NULL,
  "endX" DOUBLE PRECISION NOT NULL,
  "endY" DOUBLE PRECISION NOT NULL,
  "tracedLengthMeters" DOUBLE PRECISION NOT NULL,
  "overrideLengthMeters" DOUBLE PRECISION,
  "lengthSource" "BuildingLengthSource" NOT NULL DEFAULT 'TRACED',
  "heightMeters" DOUBLE PRECISION NOT NULL,
  "thicknessMeters" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuildingWall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuildingWall_levelId_label_key" ON "BuildingWall"("levelId", "label");
CREATE INDEX "BuildingWall_levelId_idx" ON "BuildingWall"("levelId");
ALTER TABLE "BuildingWall" ADD CONSTRAINT "BuildingWall_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "BuildingLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BuildingWallFace" (
  "id" TEXT NOT NULL,
  "wallId" TEXT NOT NULL,
  "side" "BuildingFaceSide" NOT NULL,
  "roomName" TEXT,
  "plaster" BOOLEAN NOT NULL DEFAULT false,
  "plasterHeightMeters" DOUBLE PRECISION,
  "paint" BOOLEAN NOT NULL DEFAULT false,
  "paintHeightMeters" DOUBLE PRECISION,
  CONSTRAINT "BuildingWallFace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuildingWallFace_wallId_side_key" ON "BuildingWallFace"("wallId", "side");
ALTER TABLE "BuildingWallFace" ADD CONSTRAINT "BuildingWallFace_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "BuildingWall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BuildingOpening" (
  "id" TEXT NOT NULL,
  "wallId" TEXT NOT NULL,
  "type" "BuildingOpeningType" NOT NULL,
  "label" TEXT NOT NULL,
  "positionMeters" DOUBLE PRECISION NOT NULL,
  "widthMeters" DOUBLE PRECISION NOT NULL,
  "heightMeters" DOUBLE PRECISION NOT NULL,
  "sillMeters" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuildingOpening_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BuildingOpening_wallId_idx" ON "BuildingOpening"("wallId");
ALTER TABLE "BuildingOpening" ADD CONSTRAINT "BuildingOpening_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "BuildingWall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BuildingJunction" (
  "id" TEXT NOT NULL,
  "levelId" TEXT NOT NULL,
  "continuousWallId" TEXT NOT NULL,
  "adjoiningWallId" TEXT NOT NULL,
  "adjoiningEnd" "BuildingWallEnd" NOT NULL,
  "deductionMeters" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuildingJunction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuildingJunction_adjoiningWallId_adjoiningEnd_key" ON "BuildingJunction"("adjoiningWallId", "adjoiningEnd");
CREATE INDEX "BuildingJunction_levelId_idx" ON "BuildingJunction"("levelId");
CREATE INDEX "BuildingJunction_continuousWallId_idx" ON "BuildingJunction"("continuousWallId");
ALTER TABLE "BuildingJunction" ADD CONSTRAINT "BuildingJunction_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "BuildingLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuildingJunction" ADD CONSTRAINT "BuildingJunction_continuousWallId_fkey" FOREIGN KEY ("continuousWallId") REFERENCES "BuildingWall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuildingJunction" ADD CONSTRAINT "BuildingJunction_adjoiningWallId_fkey" FOREIGN KEY ("adjoiningWallId") REFERENCES "BuildingWall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
