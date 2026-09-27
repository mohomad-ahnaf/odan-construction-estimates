-- Preserve optional Client and Project identifiers on newly created estimates.
-- Existing historical estimates keep NULL values and are not linked or rewritten.
ALTER TABLE "Estimate"
  ADD COLUMN "clientRegistrationNumberSnapshot" TEXT,
  ADD COLUMN "clientVatNumberSnapshot" TEXT,
  ADD COLUMN "projectCodeSnapshot" TEXT;
