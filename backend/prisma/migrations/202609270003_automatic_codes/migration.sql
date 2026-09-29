-- Add a separate, generated Client code without changing existing identifiers.
ALTER TABLE "Client" ADD COLUMN "clientCode" TEXT;
CREATE UNIQUE INDEX "Client_clientCode_key" ON "Client"("clientCode");

-- PostgreSQL sequences are concurrency-safe and never reuse issued values.
-- Start beyond any matching historical code; existing rows remain unchanged.
CREATE SEQUENCE odan_client_code_seq AS bigint;
SELECT setval('odan_client_code_seq', GREATEST(1, COALESCE((SELECT MAX((substring("clientCode" FROM '^ODN-CLI-([0-9]+)$'))::bigint) FROM "Client"), 0) + 1), false);

CREATE SEQUENCE odan_project_code_seq AS bigint;
SELECT setval('odan_project_code_seq', GREATEST(1, COALESCE((SELECT MAX((substring("projectCode" FROM '^ODN-PRJ-([0-9]+)$'))::bigint) FROM "Project"), 0) + 1), false);

CREATE SEQUENCE odan_estimate_number_seq AS bigint;
SELECT setval('odan_estimate_number_seq', GREATEST(1, COALESCE((SELECT MAX((substring("number" FROM '^ODN-EST-([0-9]+)$'))::bigint) FROM "Estimate"), 0) + 1), false);
