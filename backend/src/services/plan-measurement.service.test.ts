import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  listPlanDocuments: vi.fn(),
  getDocument: vi.fn(),
  getCalibration: vi.fn(),
  listMeasurements: vi.fn(),
  listProjectMeasurements: vi.fn(),
  getMeasurement: vi.fn(),
  listGroups: vi.fn(),
  getGroup: vi.fn(),
  createGroup: vi.fn(),
  renameGroup: vi.fn(),
  deleteGroup: vi.fn(),
  saveCalibration: vi.fn(),
  createMeasurement: vi.fn(),
  updateMeasurement: vi.fn(),
  deleteMeasurement: vi.fn(),
}));

vi.mock("../repositories/plan-measurement.repository.js", () => ({
  planMeasurementRepository: mocks,
}));

import {
  convertLengthToMeters,
  createMeasurementGroup,
  createMeasurement,
  deleteMeasurementGroup,
  getPlanPage,
  isSelfIntersectingPolygon,
  polygonPageArea,
  listMeasurementGroups,
  renameMeasurementGroup,
  saveCalibration,
  updateMeasurement,
} from "./plan-measurement.service.js";

const document = {
  id: "document-1",
  projectId: "project-1",
  category: "DRAWINGS",
  fileName: "plan.pdf",
  fileType: "application/pdf",
  version: 1,
  status: "DRAFT",
};
const group = {
  id: "11111111-1111-4111-8111-111111111111",
  documentId: "document-1",
  name: "Structure",
  version: 1,
};
const calibration = {
  id: "calibration-1",
  documentId: "document-1",
  pageNumber: 1,
  pageWidth: 1000,
  pageHeight: 500,
  referenceGeometry: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  referenceLengthMeters: { toString: () => "10.0000000000", valueOf: () => 10 },
  referenceUnit: "m",
  checkReferenceGeometry: null,
  checkReferenceLengthMeters: null,
  createdBy: "admin-1",
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("plan measurement service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProject.mockResolvedValue({ id: "project-1" });
    mocks.getDocument.mockResolvedValue(document);
    mocks.getCalibration.mockResolvedValue(calibration);
    mocks.getGroup.mockResolvedValue(group);
    mocks.listMeasurements.mockResolvedValue([]);
    mocks.listProjectMeasurements.mockResolvedValue([]);
    mocks.createMeasurement.mockImplementation(async (input) => ({
      ...input,
      id: "measurement-1",
      quantity: { toString: () => input.quantity },
    }));
  });

  it("converts supported reference units to metres", () => {
    expect(convertLengthToMeters({ unit: "mm", value: 1000 })).toBeCloseTo(1);
    expect(convertLengthToMeters({ unit: "cm", value: 100 })).toBeCloseTo(1);
    expect(convertLengthToMeters({ unit: "m", value: 1 })).toBeCloseTo(1);
    expect(convertLengthToMeters({ unit: "in", value: 12 })).toBeCloseTo(0.3048);
    expect(convertLengthToMeters({ unit: "ft", feet: 5, inches: 6 })).toBeCloseTo(1.6764);
  });

  it("calculates authoritative known length and area quantities", async () => {
    const length = await createMeasurement("project-1", "document-1", {
      groupId: group.id,
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 500,
      type: "LENGTH",
      label: "Wall",
      geometry: { points: [{ x: 0, y: 0 }, { x: 30, y: 0 }] },
    }, "admin-1");
    expect(Number(length.quantity)).toBeCloseTo(3);

    const area = await createMeasurement("project-1", "document-1", {
      groupId: group.id,
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 500,
      type: "AREA",
      label: "Room",
      geometry: { points: [
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 },
      ] },
    }, "admin-1");
    expect(Number(area.quantity)).toBeCloseTo(2);
    expect(polygonPageArea([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }])).toBe(100);
  });

  it("rejects geometry from a different page aspect or coordinate space", async () => {
    await expect(createMeasurement("project-1", "document-1", {
      groupId: group.id,
      pageNumber: 1,
      pageWidth: 500,
      pageHeight: 1000,
      type: "LENGTH",
      label: "Wrong page",
      geometry: { points: [{ x: 0, y: 0 }, { x: 30, y: 0 }] },
    }, "admin-1")).rejects.toThrow("do not match");
  });

  it("rejects zero references and self-intersecting polygons", async () => {
    await expect(saveCalibration("project-1", "document-1", {
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 500,
      reference: {
        points: [{ x: 10, y: 10 }, { x: 10, y: 10 }],
        length: { unit: "m", value: 1 },
      },
    }, "admin-1")).rejects.toThrow("measurable distance");
    expect(isSelfIntersectingPolygon([
      { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 },
    ])).toBe(true);
    await expect(createMeasurement("project-1", "document-1", {
      groupId: group.id,
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 500,
      type: "AREA",
      label: "Invalid",
      geometry: { points: [
        { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 },
      ] },
    }, "admin-1")).rejects.toThrow();
  });

  it("isolates records by exact project, document revision and page", async () => {
    mocks.getDocument.mockResolvedValueOnce({ ...document, projectId: "another-project" });
    await expect(getPlanPage("project-1", "document-1", 1)).rejects.toThrow("not found");
    mocks.getDocument.mockResolvedValueOnce({ ...document, fileType: "image/png" });
    await expect(getPlanPage("project-1", "document-1", 2)).rejects.toThrow("only one page");
  });

  it("reloads saved calibration and measurements for the exact page", async () => {
    mocks.listMeasurements.mockResolvedValueOnce([{
      id: "measurement-1",
      documentId: "document-1",
      pageNumber: 1,
      quantity: { toString: () => "3.0000000000" },
    }]);
    const result = await getPlanPage("project-1", "document-1", 1);
    expect(result.calibration?.version).toBe(1);
    expect(result.measurements).toEqual([
      expect.objectContaining({ id: "measurement-1", pageNumber: 1, quantity: "3.0000000000" }),
    ]);
  });

  it("passes the current calibration version so recalibration is conflict-safe", async () => {
    mocks.saveCalibration.mockResolvedValue({ ...calibration, version: 2 });
    await saveCalibration("project-1", "document-1", {
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 500,
      reference: {
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        length: { unit: "m", value: 10 },
      },
      version: 1,
    }, "admin-1");
    expect(mocks.saveCalibration).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "document-1",
      pageNumber: 1,
      version: 1,
    }));
  });

  it("keeps groups independent for two exact document revisions", async () => {
    mocks.getDocument.mockImplementation(async (id: string) => ({ ...document, id }));
    mocks.listGroups.mockImplementation(async (documentId: string) => [{ ...group, documentId }]);

    const first = await listMeasurementGroups("project-1", "document-1");
    const second = await listMeasurementGroups("project-1", "document-2");
    expect(first[0].documentId).toBe("document-1");
    expect(second[0].documentId).toBe("document-2");
    expect(mocks.listGroups).toHaveBeenNthCalledWith(1, "document-1");
    expect(mocks.listGroups).toHaveBeenNthCalledWith(2, "document-2");
  });

  it("creates, renames and deletes groups only after resolving their drawing revision", async () => {
    mocks.createGroup.mockResolvedValue(group);
    mocks.renameGroup.mockResolvedValue({ ...group, name: "Finishes", version: 2 });
    mocks.deleteGroup.mockResolvedValue(undefined);

    await createMeasurementGroup("project-1", "document-1", { name: "Structure" }, "admin-1");
    await renameMeasurementGroup(group.id, { name: "Finishes", version: 1 }, "admin-1");
    await deleteMeasurementGroup(group.id, { version: 2 }, "admin-1");
    expect(mocks.createGroup).toHaveBeenCalledWith({ documentId: "document-1", name: "Structure", actorId: "admin-1" });
    expect(mocks.renameGroup).toHaveBeenCalledWith(group.id, 1, "Finishes", "admin-1");
    expect(mocks.deleteGroup).toHaveBeenCalledWith(group.id, { version: 2 }, "admin-1");
  });

  it("rejects cross-revision creation and moves", async () => {
    mocks.getGroup.mockResolvedValueOnce({ ...group, documentId: "document-2" });
    await expect(createMeasurement("project-1", "document-1", {
      groupId: group.id,
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 500,
      type: "COUNT",
      label: "Doors",
      geometry: { points: [{ x: 1, y: 1 }] },
    }, "admin-1")).rejects.toThrow("does not belong");

    mocks.getMeasurement.mockResolvedValue({
      id: "measurement-1",
      documentId: "document-1",
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 500,
      type: "COUNT",
      version: 1,
    });
    mocks.getGroup.mockResolvedValueOnce({ ...group, documentId: "document-2" });
    await expect(updateMeasurement("measurement-1", {
      version: 1,
      groupId: group.id,
    }, "admin-1")).rejects.toThrow("does not belong");
    expect(mocks.updateMeasurement).not.toHaveBeenCalled();
  });
});
