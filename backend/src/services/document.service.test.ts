import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  listForProject: vi.fn(),
  get: vi.fn(),
  history: vi.fn(),
  findLatestByCombination: vi.fn(),
  createInitial: vi.fn(),
  createRevision: vi.fn(),
  transition: vi.fn(),
  approvalHistory: vi.fn(),
  remove: vi.fn(),
  getAuthenticatedDriveClient: vi.fn(),
  ensureProjectDriveFolders: vi.fn(),
  uploadDriveFile: vi.fn(),
  deleteDriveFile: vi.fn(),
  getDriveFileMetadata: vi.fn(),
}));

vi.mock("../repositories/document.repository.js", () => ({
  documentRepository: {
    findProject: mocks.findProject,
    listForProject: mocks.listForProject,
    get: mocks.get,
    history: mocks.history,
    findLatestByCombination: mocks.findLatestByCombination,
    createInitial: mocks.createInitial,
    createRevision: mocks.createRevision,
    transition: mocks.transition,
    approvalHistory: mocks.approvalHistory,
    remove: mocks.remove,
  },
}));

vi.mock("./google-drive.service.js", () => ({
  getAuthenticatedDriveClient: mocks.getAuthenticatedDriveClient,
  ensureProjectDriveFolders: mocks.ensureProjectDriveFolders,
  uploadDriveFile: mocks.uploadDriveFile,
  deleteDriveFile: mocks.deleteDriveFile,
  getDriveFileMetadata: mocks.getDriveFileMetadata,
  generateDriveLinks: (id: string) => ({
    viewUrl: `view/${id}`,
    downloadUrl: `download/${id}`,
  }),
}));

import {
  approveDocument,
  deleteDocument,
  getDocumentVersions,
  rejectDocument,
  submitDocument,
  uploadDocumentRevision,
  uploadProjectDocument,
  validateDocumentFile,
} from "./document.service.js";

function uploadedFile(
  originalname = "site-plan.pdf",
  mimetype = "application/pdf",
): Express.Multer.File {
  const buffer = Buffer.from("document-content");
  return {
    fieldname: "file",
    originalname,
    encoding: "7bit",
    mimetype,
    size: buffer.length,
    buffer,
    destination: "",
    filename: "",
    path: "",
    stream: undefined as never,
  };
}

describe("project document service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProject.mockResolvedValue({
      id: "project-1",
      projectCode: "ODN-PRJ-0001",
      projectName: "Harbour Office",
    });
    mocks.getAuthenticatedDriveClient.mockResolvedValue({});
    mocks.ensureProjectDriveFolders.mockResolvedValue({
      categories: { Other: "folder-other" },
    });
    mocks.uploadDriveFile.mockResolvedValue({ id: "drive-file-1" });
    mocks.findLatestByCombination.mockResolvedValue(null);
    mocks.createInitial.mockImplementation(async (input) => ({
      ...input,
      version: 1,
      isLatest: true,
      versionGroupId: input.id,
    }));
    mocks.createRevision.mockImplementation(async (_id, input) => ({
      ...input,
      version: 2,
      isLatest: true,
      versionGroupId: "group-1",
    }));
    mocks.deleteDriveFile.mockResolvedValue(true);
    mocks.transition.mockImplementation(
      async (id, _actor, _expected, status) => ({
        id,
        status,
        googleDriveFileId: "drive-file-1",
      }),
    );
  });

  it("accepts only a matching supported extension and MIME type", () => {
    expect(validateDocumentFile(uploadedFile()).mimeType).toBe("application/pdf");
    expect(() =>
      validateDocumentFile(uploadedFile("payload.exe", "application/octet-stream")),
    ).toThrow("Unsupported document type");
    expect(() =>
      validateDocumentFile(uploadedFile("renamed.pdf", "image/png")),
    ).toThrow("Unsupported document type");
  });

  it("uploads to the project category folder and stores metadata only", async () => {
    const result = await uploadProjectDocument(
      "project-1",
      "OTHER",
      uploadedFile(),
      "user-1",
    );

    expect(mocks.ensureProjectDriveFolders).toHaveBeenCalledWith(
      {},
      "ODN-PRJ-0001",
      "Harbour Office",
    );
    expect(mocks.uploadDriveFile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ folderId: "folder-other" }),
    );
    const stored = mocks.createInitial.mock.calls[0]![0];
    expect(stored).toMatchObject({
      projectId: "project-1",
      uploadedBy: "user-1",
      googleDriveFileId: "drive-file-1",
      googleDriveFolderId: "folder-other",
    });
    expect(stored).not.toHaveProperty("buffer");
    expect(result.links.viewUrl).toBe("view/drive-file-1");
  });

  it("creates a new version instead of overwriting a matching document", async () => {
    mocks.findLatestByCombination.mockResolvedValueOnce({ id: "document-1" });
    const result = await uploadProjectDocument(
      "project-1",
      "OTHER",
      uploadedFile(),
      "user-1",
      "Updated dimensions",
    );
    expect(mocks.createInitial).not.toHaveBeenCalled();
    expect(mocks.createRevision).toHaveBeenCalledWith(
      "document-1",
      expect.objectContaining({
        revisionNote: "Updated dimensions",
        googleDriveFileId: "drive-file-1",
      }),
    );
    expect(result.version).toBe(2);
  });

  it("uploads an explicit revision and returns ordered history", async () => {
    mocks.get.mockResolvedValue({
      id: "document-1",
      projectId: "project-1",
      category: "DRAWINGS",
      googleDriveFolderId: "folder-drawings",
      versionGroupId: "group-1",
    });
    await uploadDocumentRevision(
      "document-1",
      uploadedFile("site-plan-r2.pdf"),
      "user-1",
      "Consultant update",
    );
    expect(mocks.uploadDriveFile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        folderId: "folder-drawings",
        fileName: "site-plan-r2.pdf",
      }),
    );
    expect(mocks.createRevision).toHaveBeenCalledWith(
      "document-1",
      expect.objectContaining({ category: "DRAWINGS" }),
    );

    mocks.history.mockResolvedValueOnce([
      { googleDriveFileId: "drive-file-2", version: 2 },
      { googleDriveFileId: "drive-file-1", version: 1 },
    ]);
    const history = await getDocumentVersions("document-1");
    expect(history.map((record) => record.version)).toEqual([2, 1]);
  });

  it("removes the Drive file if the metadata transaction fails", async () => {
    mocks.createInitial.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      uploadProjectDocument(
        "project-1",
        "OTHER",
        uploadedFile(),
        "user-1",
      ),
    ).rejects.toThrow("database unavailable");
    expect(mocks.deleteDriveFile).toHaveBeenCalledWith({}, "drive-file-1");
  });

  it("enforces latest-version approval transitions", async () => {
    mocks.get.mockResolvedValueOnce({
      id: "document-1",
      isLatest: true,
      status: "DRAFT",
    });
    await submitDocument("document-1", "admin-1", null);
    expect(mocks.transition).toHaveBeenLastCalledWith(
      "document-1",
      "admin-1",
      "DRAFT",
      "PENDING_REVIEW",
      "SUBMITTED",
      null,
    );

    mocks.get.mockResolvedValueOnce({
      id: "document-1",
      isLatest: true,
      status: "PENDING_REVIEW",
    });
    await approveDocument("document-1", "admin-1", "Reviewed");
    expect(mocks.transition).toHaveBeenLastCalledWith(
      "document-1",
      "admin-1",
      "PENDING_REVIEW",
      "APPROVED",
      "APPROVED",
      "Reviewed",
    );

    mocks.get.mockResolvedValueOnce({
      id: "document-old",
      isLatest: false,
      status: "PENDING_REVIEW",
    });
    await expect(
      rejectDocument("document-old", "admin-1", "Outdated"),
    ).rejects.toThrow("Only the latest document version can be reviewed");
  });

  it("blocks deletion of approved documents before touching Drive", async () => {
    mocks.get.mockResolvedValueOnce({
      id: "document-1",
      status: "APPROVED",
      googleDriveFileId: "drive-file-1",
    });
    await expect(deleteDocument("document-1", "admin-1")).rejects.toThrow(
      "Approved documents cannot be deleted",
    );
    expect(mocks.deleteDriveFile).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
