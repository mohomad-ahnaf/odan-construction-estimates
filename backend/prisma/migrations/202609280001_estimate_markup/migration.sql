-- Additive percentage column. Existing estimates retain their values and use 0% markup.
ALTER TABLE "Estimate"
  ADD COLUMN "markupPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "Estimate"
  ADD CONSTRAINT "Estimate_markupPercent_range_check"
  CHECK ("markupPercent" >= 0 AND "markupPercent" <= 100);
