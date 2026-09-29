import { Prisma } from "@prisma/client";
import { totals } from "./totals.js";
import { estimateDescription } from "./estimate-description.js";

type Source = {
  number: string;
  title: string;
  description: string | null;
  currency: string;
  items: Parameters<typeof totals>[0];
  taxPercent: Prisma.Decimal;
  markupPercent: Prisma.Decimal;
};
export type SavedSnapshot = {
  estimateNumberSnapshot: string;
  descriptionSnapshot: string;
  currencySnapshot: string;
  rateSnapshot: Prisma.Decimal;
  amountSnapshot: Prisma.Decimal;
};

export function selectedEstimateSnapshot(
  source: Source,
  saved?: SavedSnapshot,
  refresh = false,
): SavedSnapshot {
  if (saved && !refresh)
    return {
      estimateNumberSnapshot: saved.estimateNumberSnapshot,
      descriptionSnapshot: saved.descriptionSnapshot,
      currencySnapshot: saved.currencySnapshot,
      rateSnapshot: saved.rateSnapshot,
      amountSnapshot: saved.amountSnapshot,
    };
  const finalTotal = new Prisma.Decimal(
    totals(source.items, source.taxPercent, source.markupPercent).total,
  );
  return {
    estimateNumberSnapshot: source.number,
    descriptionSnapshot: estimateDescription(source),
    currencySnapshot: source.currency,
    rateSnapshot: finalTotal,
    amountSnapshot: finalTotal,
  };
}

export function clientEstimateGrandTotal(rows: SavedSnapshot[]) {
  return rows.reduce(
    (sum, row) => sum.add(row.amountSnapshot),
    new Prisma.Decimal(0),
  );
}
