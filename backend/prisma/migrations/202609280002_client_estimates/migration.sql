-- New, independent saved Client Estimate records. Existing tables and rows are untouched.
CREATE SEQUENCE odan_client_estimate_number_seq AS bigint;

CREATE TABLE "ClientEstimate" (
    "id" TEXT NOT NULL,
    "clientEstimateNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientNameSnapshot" TEXT NOT NULL,
    "clientNumberSnapshot" TEXT,
    "projectNameSnapshot" TEXT NOT NULL,
    "projectCodeSnapshot" TEXT,
    "clientEstimateDate" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "grandTotalSnapshot" DECIMAL(18,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientEstimate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClientEstimate_grandTotal_nonnegative" CHECK ("grandTotalSnapshot" >= 0)
);

CREATE TABLE "ClientEstimateItem" (
    "id" TEXT NOT NULL,
    "clientEstimateId" TEXT NOT NULL,
    "sourceEstimateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "estimateNumberSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT NOT NULL,
    "currencySnapshot" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "rateSnapshot" DECIMAL(16,2) NOT NULL,
    "amountSnapshot" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientEstimateItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClientEstimateItem_fixed_quantity" CHECK ("quantity" = 1),
    CONSTRAINT "ClientEstimateItem_amount_matches_rate" CHECK ("amountSnapshot" = "rateSnapshot" AND "rateSnapshot" >= 0)
);

CREATE UNIQUE INDEX "ClientEstimate_clientEstimateNumber_key" ON "ClientEstimate"("clientEstimateNumber");
CREATE INDEX "ClientEstimate_projectId_createdAt_idx" ON "ClientEstimate"("projectId", "createdAt");
CREATE INDEX "ClientEstimate_clientId_createdAt_idx" ON "ClientEstimate"("clientId", "createdAt");
CREATE UNIQUE INDEX "ClientEstimateItem_clientEstimateId_sourceEstimateId_key" ON "ClientEstimateItem"("clientEstimateId", "sourceEstimateId");
CREATE UNIQUE INDEX "ClientEstimateItem_clientEstimateId_position_key" ON "ClientEstimateItem"("clientEstimateId", "position");
CREATE INDEX "ClientEstimateItem_sourceEstimateId_idx" ON "ClientEstimateItem"("sourceEstimateId");

ALTER TABLE "ClientEstimate" ADD CONSTRAINT "ClientEstimate_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientEstimate" ADD CONSTRAINT "ClientEstimate_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientEstimate" ADD CONSTRAINT "ClientEstimate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientEstimateItem" ADD CONSTRAINT "ClientEstimateItem_clientEstimateId_fkey"
    FOREIGN KEY ("clientEstimateId") REFERENCES "ClientEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientEstimateItem" ADD CONSTRAINT "ClientEstimateItem_sourceEstimateId_fkey"
    FOREIGN KEY ("sourceEstimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
