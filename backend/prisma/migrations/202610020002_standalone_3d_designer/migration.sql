-- Replaces the drawing-bound Building Model. Its records are intentionally not migrated:
-- drawing page coordinates and calibration have no reliable standalone equivalent.
DROP TABLE "BuildingJunction";
DROP TABLE "BuildingOpening";
DROP TABLE "BuildingWallFace";
DROP TABLE "BuildingWall";
DROP TABLE "BuildingLevel";
DROP TABLE "BuildingModel";
DROP TYPE "BuildingWallEnd";
DROP TYPE "BuildingOpeningType";
DROP TYPE "BuildingFaceSide";
DROP TYPE "BuildingLengthSource";
DROP TYPE "BuildingReviewStatus";

CREATE TYPE "DesignerReviewStatus" AS ENUM ('DRAFT', 'REVIEWED');
CREATE TABLE "DesignerModel" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Ground floor',
  "floorHeightMeters" DOUBLE PRECISION NOT NULL DEFAULT 3,
  "geometry" JSONB NOT NULL DEFAULT '{"walls":[],"junctions":[]}',
  "status" "DesignerReviewStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DesignerModel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DesignerModel_projectId_key" ON "DesignerModel"("projectId");
ALTER TABLE "DesignerModel" ADD CONSTRAINT "DesignerModel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DesignerModel" ADD CONSTRAINT "DesignerModel_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
