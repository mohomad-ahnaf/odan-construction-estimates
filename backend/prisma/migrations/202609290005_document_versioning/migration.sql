-- Add version metadata without changing the meaning of existing documents.
ALTER TABLE "Document"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "revisionNote" TEXT,
ADD COLUMN "isLatest" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "versionGroupId" TEXT;

-- Every existing document starts as version 1 of its own history chain.
UPDATE "Document" SET "versionGroupId" = "id" WHERE "versionGroupId" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "versionGroupId" SET NOT NULL;

CREATE INDEX "Document_projectId_isLatest_createdAt_idx"
ON "Document"("projectId", "isLatest", "createdAt");

CREATE UNIQUE INDEX "Document_versionGroupId_version_key"
ON "Document"("versionGroupId", "version");
