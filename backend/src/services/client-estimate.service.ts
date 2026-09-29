import type { EstimateStatus, Role } from "@prisma/client";
import { clientEstimateRepository as repo } from "../repositories/client-estimate.repository.js";
import type { ClientEstimateInput } from "../client-estimate.validation.js";
import { AppError } from "../middleware/errors.js";
import { checkTransition } from "./estimate.service.js";

type RecordWithItems = NonNullable<Awaited<ReturnType<typeof repo.get>>>;

export function serializeClientEstimate(record: RecordWithItems) {
  return {
    ...record,
    grandTotal: record.grandTotalSnapshot.toFixed(2),
    items: record.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      rateSnapshot: item.rateSnapshot.toFixed(2),
      amountSnapshot: item.amountSnapshot.toFixed(2),
    })),
  };
}

export async function getClientEstimate(id: string) {
  const record = await repo.get(id);
  if (!record) throw new AppError(404, "Client Estimate not found");
  return record;
}

export async function listClientEstimates(projectId: string, page: number) {
  const [records, total] = await repo.listForProject(projectId, page);
  return {
    data: records.map(serializeClientEstimate),
    total,
    page,
    pageSize: 20,
  };
}

export async function createClientEstimate(
  projectId: string,
  input: ClientEstimateInput,
  actorId: string,
) {
  return serializeClientEstimate(await repo.create(projectId, input, actorId));
}

export async function updateClientEstimate(
  id: string,
  input: ClientEstimateInput,
  version: number,
  actorId: string,
) {
  return serializeClientEstimate(
    await repo.update(id, input, version, actorId),
  );
}

export async function changeClientEstimateStatus(
  id: string,
  status: EstimateStatus,
  version: number,
  actorId: string,
  role: Role,
) {
  const current = await getClientEstimate(id);
  checkTransition(current.status, status, role);
  return serializeClientEstimate(
    await repo.status(id, current.status, status, version, actorId),
  );
}
