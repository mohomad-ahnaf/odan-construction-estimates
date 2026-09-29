-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentApprovalAction" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- Existing document rows safely receive DRAFT through this non-destructive default.
ALTER TABLE "Document"
ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "DocumentApproval" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "action" "DocumentApprovalAction" NOT NULL,
    "comment" TEXT,
    "approvedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentApproval_documentId_createdAt_idx"
ON "DocumentApproval"("documentId", "createdAt");

CREATE INDEX "DocumentApproval_approvedBy_idx"
ON "DocumentApproval"("approvedBy");

ALTER TABLE "DocumentApproval"
ADD CONSTRAINT "DocumentApproval_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentApproval"
ADD CONSTRAINT "DocumentApproval_approvedBy_fkey"
FOREIGN KEY ("approvedBy") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
