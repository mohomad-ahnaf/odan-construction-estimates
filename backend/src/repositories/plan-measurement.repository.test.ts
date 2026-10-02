import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  pageCalibration: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
  },
  planMeasurement: { updateMany: vi.fn() },
  planMeasurementGroup: {
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn(async (callback) => callback(tx)));

vi.mock("../db.js", () => ({ db: { $transaction: transaction } }));

import { planMeasurementRepository } from "./plan-measurement.repository.js";

describe("plan measurement persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.pageCalibration.findUnique.mockResolvedValue({ id: "calibration-1", version: 2 });
    tx.pageCalibration.updateMany.mockResolvedValue({ count: 1 });
    tx.pageCalibration.findUniqueOrThrow.mockResolvedValue({
      id: "calibration-1",
      documentId: "document-1",
      pageNumber: 3,
      version: 3,
    });
    tx.planMeasurement.updateMany.mockResolvedValue({ count: 2 });
    tx.planMeasurementGroup.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({});
  });

  it("resets confirmation and increments versions after recalibration", async () => {
    await planMeasurementRepository.saveCalibration({
      documentId: "document-1",
      pageNumber: 3,
      pageWidth: 1000,
      pageHeight: 700,
      referenceGeometry: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      referenceLengthMeters: "10.0000000000",
      referenceUnit: "m",
      actorId: "admin-1",
      version: 2,
      measurementQuantities: [
        { id: "measurement-1", quantity: "4.0000000000" },
        { id: "measurement-2", quantity: "2.0000000000" },
      ],
    });

    expect(tx.planMeasurement.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.planMeasurement.updateMany).toHaveBeenCalledWith({
      where: { id: "measurement-1", documentId: "document-1", pageNumber: 3 },
      data: { quantity: "4.0000000000", confirmed: false, version: { increment: 1 } },
    });
  });

  it("rejects a stale calibration update", async () => {
    await expect(planMeasurementRepository.saveCalibration({
      documentId: "document-1",
      pageNumber: 3,
      pageWidth: 1000,
      pageHeight: 700,
      referenceGeometry: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      referenceLengthMeters: "10.0000000000",
      referenceUnit: "m",
      actorId: "admin-1",
      version: 1,
      measurementQuantities: [],
    })).rejects.toThrow("reload before saving");
    expect(tx.planMeasurement.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to delete a nonempty measurement group", async () => {
    tx.planMeasurementGroup.findUnique.mockResolvedValue({
      id: "group-1",
      documentId: "document-1",
      version: 1,
      _count: { measurements: 2 },
    });

    await expect(planMeasurementRepository.deleteGroup("group-1", { version: 1 }, "admin-1"))
      .rejects.toThrow("Move all measurements");
    expect(tx.planMeasurementGroup.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "PLAN_MEASUREMENT_GROUP_DELETED" }),
    }));
  });

  it("moves measurements and deletes the source in one transaction", async () => {
    tx.planMeasurementGroup.findUnique
      .mockResolvedValueOnce({ id: "group-1", documentId: "document-1", _count: { measurements: 2 } })
      .mockResolvedValueOnce({ id: "group-2", documentId: "document-1" });
    tx.planMeasurementGroup.deleteMany.mockResolvedValue({ count: 1 });

    await expect(planMeasurementRepository.deleteGroup("group-1", {
      version: 1, destinationGroupId: "group-2",
    }, "admin-1")).resolves.toEqual({ destinationGroupId: "group-2", movedCount: 2 });
    expect(tx.planMeasurement.updateMany).toHaveBeenCalledWith({
      where: { groupId: "group-1", documentId: "document-1" },
      data: { groupId: "group-2", version: { increment: 1 } },
    });
    expect(tx.planMeasurementGroup.deleteMany).toHaveBeenCalledWith({ where: { id: "group-1", version: 2 } });
  });

  it("rejects a destination from another drawing revision before moving measurements", async () => {
    tx.planMeasurementGroup.findUnique
      .mockResolvedValueOnce({ id: "group-1", documentId: "document-1", _count: { measurements: 2 } })
      .mockResolvedValueOnce({ id: "group-2", documentId: "document-2" });
    await expect(planMeasurementRepository.deleteGroup("group-1", {
      version: 1, destinationGroupId: "group-2",
    }, "admin-1")).rejects.toThrow("same drawing revision");
    expect(tx.planMeasurement.updateMany).not.toHaveBeenCalled();
    expect(tx.planMeasurementGroup.deleteMany).not.toHaveBeenCalled();
  });
});
