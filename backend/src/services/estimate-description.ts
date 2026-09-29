export function estimateDescription(estimate: {
  number: string;
  description: string | null;
}) {
  return estimate.description?.trim() || `Estimate ${estimate.number}`;
}
