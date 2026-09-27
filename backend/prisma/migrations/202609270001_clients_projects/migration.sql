CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "registrationNumber" TEXT,
  "vatNumber" TEXT,
  "address" TEXT,
  "contactPerson" TEXT,
  "telephone" TEXT,
  "email" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Client_registrationNumber_key" ON "Client"("registrationNumber");
CREATE UNIQUE INDEX "Client_vatNumber_key" ON "Client"("vatNumber");
CREATE INDEX "Client_name_idx" ON "Client"("name");

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "projectCode" TEXT,
  "projectName" TEXT NOT NULL,
  "siteAddress" TEXT,
  "description" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "startDate" DATE,
  "completionDate" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");
CREATE INDEX "Project_clientId_status_idx" ON "Project"("clientId", "status");
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Estimate" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Estimate" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Estimate" ADD COLUMN "estimateDate" DATE;
CREATE INDEX "Estimate_clientId_createdAt_idx" ON "Estimate"("clientId", "createdAt");
CREATE INDEX "Estimate_projectId_idx" ON "Estimate"("projectId");
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
