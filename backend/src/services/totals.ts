import { Prisma } from "@prisma/client";
type Numeric = number | string | Prisma.Decimal;
export function totals(
  items: { quantity: Numeric; rate: Numeric }[],
  taxPercent: Numeric,
  markupPercent: Numeric = 0,
) {
  const lines = items.map((i) =>
    new Prisma.Decimal(i.quantity)
      .mul(i.rate)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
  );
  const baseSubtotal = lines.reduce((a, b) => a.add(b), new Prisma.Decimal(0));
  const markupAmount = baseSubtotal
    .mul(markupPercent)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const subtotalAfterMarkup = baseSubtotal.add(markupAmount);
  const tax = subtotalAfterMarkup
    .mul(taxPercent)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    lines: lines.map((v) => v.toFixed(2)),
    subtotal: baseSubtotal.toFixed(2),
    baseSubtotal: baseSubtotal.toFixed(2),
    markupAmount: markupAmount.toFixed(2),
    subtotalAfterMarkup: subtotalAfterMarkup.toFixed(2),
    tax: tax.toFixed(2),
    total: subtotalAfterMarkup.add(tax).toFixed(2),
  };
}
