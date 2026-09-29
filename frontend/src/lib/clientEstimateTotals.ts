export function sumClientEstimateAmounts(amounts: string[]) {
  const cents = amounts.reduce((sum, amount) => {
    const match = /^(\d+)\.(\d{2})$/.exec(amount);
    if (!match) throw new Error("Invalid snapshot amount");
    return sum + BigInt(match[1]) * 100n + BigInt(match[2]);
  }, 0n);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}
