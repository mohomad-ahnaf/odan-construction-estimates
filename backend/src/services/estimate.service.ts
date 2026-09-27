import { randomUUID } from "node:crypto";
import type { Role, EstimateStatus } from "@prisma/client";
import { estimateRepository as repo } from "../repositories/estimate.repository.js";
import type { EstimateInput } from "../validation.js";
import { totals } from "./totals.js";
import { AppError } from "../middleware/errors.js";
type RecordWithItems = NonNullable<Awaited<ReturnType<typeof repo.get>>>;
export const serialize = (estimate: RecordWithItems) => ({
  ...estimate,
  taxPercent: Number(estimate.taxPercent),
  items: estimate.items.map((item) => ({
    ...item,
    quantity: Number(item.quantity),
    rate: Number(item.rate),
  })),
  totals: totals(estimate.items, estimate.taxPercent),
});
export async function getEstimate(id: string) {
  const estimate = await repo.get(id);
  if (!estimate) throw new AppError(404, "Estimate not found");
  return estimate;
}
export async function listEstimates(search: string, page: number) {
  const [records, total] = await repo.list(search, page);
  return { data: records.map(serialize), total, page, pageSize: 20 };
}
export async function createEstimate(input: EstimateInput, actorId: string) {
  return serialize(
    await repo.create(
      input,
      `OD-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      actorId,
    ),
  );
}
export async function updateEstimate(
  id: string,
  input: EstimateInput,
  version: number,
  actorId: string,
) {
  await getEstimate(id);
  return serialize(await repo.update(id, input, version, actorId));
}
export function checkTransition(
  from: EstimateStatus,
  to: EstimateStatus,
  role: Role,
) {
  const transitions: Record<EstimateStatus, EstimateStatus[]> = {
    DRAFT: ["SENT"],
    SENT: ["DRAFT", "APPROVED", "REJECTED"],
    APPROVED: [],
    REJECTED: ["DRAFT"],
  };
  if (!transitions[from].includes(to))
    throw new AppError(409, "This status transition is not allowed");
  if (["APPROVED", "REJECTED"].includes(to) && role !== "ADMIN")
    throw new AppError(
      403,
      "Only administrators can approve or reject estimates",
    );
}
export async function changeStatus(
  id: string,
  status: EstimateStatus,
  version: number,
  actorId: string,
  role: Role,
) {
  const current = await getEstimate(id);
  checkTransition(current.status, status, role);
  return serialize(
    await repo.status(id, version, current.status, status, actorId),
  );
}
