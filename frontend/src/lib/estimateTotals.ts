/** Integer-scaled preview that follows the API's per-line half-up rounding. */
const parseScaled = (value: number | string, places: number): bigint | null => {
  const text = String(value);
  const match = new RegExp(`^(\\d+)(?:\\.(\\d{1,${places}}))?$`).exec(text);
  if (!match) return null;
  return (
    BigInt(match[1]) * 10n ** BigInt(places) +
    BigInt((match[2] ?? "").padEnd(places, "0"))
  );
};
const roundDiv = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;
const cents = (value: bigint) =>
  `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;

export function previewEstimateTotals(
  items: { quantity: number; rate: number }[],
  markupPercent: number,
  taxPercent: number,
) {
  if (!items.length) return null;
  const markupBasis = parseScaled(markupPercent, 2);
  const taxBasis = parseScaled(taxPercent, 2);
  if (
    markupBasis === null ||
    markupBasis > 10000n ||
    taxBasis === null ||
    taxBasis > 10000n
  )
    return null;
  let base = 0n;
  for (const item of items) {
    const quantity = parseScaled(item.quantity, 3);
    const rate = parseScaled(item.rate, 2);
    if (
      quantity === null ||
      quantity === 0n ||
      quantity > 1000000000n ||
      rate === null ||
      rate > 1000000000n
    )
      return null;
    base += roundDiv(quantity * rate, 1000n);
  }
  const markup = roundDiv(base * markupBasis, 10000n);
  const afterMarkup = base + markup;
  const tax = roundDiv(afterMarkup * taxBasis, 10000n);
  return {
    baseSubtotal: cents(base),
    markupAmount: cents(markup),
    subtotalAfterMarkup: cents(afterMarkup),
    tax: cents(tax),
    total: cents(afterMarkup + tax),
  };
}
