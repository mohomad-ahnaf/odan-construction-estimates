import { Prisma } from "@prisma/client";
type Numeric = number | string | Prisma.Decimal;
export function totals(
  items: { quantity: Numeric; rate: Numeric }[],
  taxPercent: Numeric,
) {
  const lines = items.map((i) =>
    new Prisma.Decimal(i.quantity)
      .mul(i.rate)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
  );
  const subtotal = lines.reduce((a, b) => a.add(b), new Prisma.Decimal(0));
  const tax = subtotal
    .mul(taxPercent)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    lines: lines.map((v) => v.toFixed(2)),
    subtotal: subtotal.toFixed(2),
    tax: tax.toFixed(2),
    total: subtotal.add(tax).toFixed(2),
  };
}
