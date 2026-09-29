-- Widen only new Client Estimate money columns to support the maximum valid source totals.
ALTER TABLE "ClientEstimate"
  ALTER COLUMN "grandTotalSnapshot" TYPE DECIMAL(24,2);
ALTER TABLE "ClientEstimateItem"
  ALTER COLUMN "rateSnapshot" TYPE DECIMAL(24,2),
  ALTER COLUMN "amountSnapshot" TYPE DECIMAL(24,2);
