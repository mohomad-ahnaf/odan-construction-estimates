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
  updateMetadata: vi.fn(),
  removeVersionGroup: vi.fn(),
  getAuthenticatedDriveClient: vi.fn(),
  ensureProjectDriveFolders: vi.fn(),
  uploadDriveFile: vi.fn(),
  deleteDriveFile: vi.fn(),
  setDriveFileTrashed: vi.fn(),
  getDriveFileContent: vi.fn(),
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
    updateMetadata: mocks.updateMetadata,
    removeVersionGroup: mocks.removeVersionGroup,
  },
}));

vi.mock("./google-drive.service.js", () => ({
  getAuthenticatedDriveClient: mocks.getAuthenticatedDriveClient,
  ensureProjectDriveFolders: mocks.ensureProjectDriveFolders,
  uploadDriveFile: mocks.uploadDriveFile,
  deleteDriveFile: mocks.deleteDriveFile,
  setDriveFileTrashed: mocks.setDriveFileTrashed,
  getDriveFileContent: mocks.getDriveFileContent,
  getDriveFileMetadata: mocks.getDriveFileMetadata,
  generateDriveLinks: (id: string) => ({
    viewUrl: `view/${id}`,
    downloadUrl: `download/${id}`,
  }),
}));

import {
  approveDocument,
  deleteDocument,
  deletePhotoHistory,
  getDocumentContent,
  getDocumentVersions,
  rejectDocument,
  submitDocument,
  uploadDocumentRevision,
  uploadProjectDocument,
  updateDocumentMetadata,
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
    mocks.setDriveFileTrashed.mockResolvedValue(true);
    mocks.getDriveFileContent.mockResolvedValue({ pipe: vi.fn() });
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

  it("retrieves private file content through the authenticated Drive client", async () => {
    const stream = { pipe: vi.fn() };
    mocks.get.mockResolvedValueOnce({
      fileName: "site-plan.pdf",
      fileType: "application/pdf",
      fileSize: 2048,
      googleDriveFileId: "drive-file-1",
    });
    mocks.getDriveFileContent.mockResolvedValueOnce(stream);

    await expect(getDocumentContent("document-1")).resolves.toEqual({
      stream,
      fileName: "site-plan.pdf",
      fileType: "application/pdf",
      fileSize: 2048,
    });
    expect(mocks.getAuthenticatedDriveClient).toHaveBeenCalledOnce();
    expect(mocks.getDriveFileContent).toHaveBeenCalledWith({}, "drive-file-1");
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
  it("stores optional display metadata separately from original file metadata", async () => {
    await uploadProjectDocument("project-1", "OTHER", uploadedFile(), "user-1", null,
      { title: "Site arrival", description: "North elevation" });
    expect(mocks.createInitial.mock.calls[0]![0]).toMatchObject({
      fileName: "site-plan.pdf", title: "Site arrival", description: "North elevation",
    });
    mocks.get.mockResolvedValueOnce({ id: "document-1", isLatest: true, status: "DRAFT" });
    mocks.updateMetadata.mockResolvedValueOnce({ id: "document-1", googleDriveFileId: "drive-file-1",
      fileName: "site-plan.pdf", title: "Arrival", description: null });
    const changed = await updateDocumentMetadata("document-1", { title: "Arrival" }, "admin-1");
    expect(changed.fileName).toBe("site-plan.pdf");
    expect(mocks.updateMetadata).toHaveBeenCalledWith("document-1", "Arrival", undefined, "admin-1");
    mocks.get.mockResolvedValueOnce({ id: "document-1", isLatest: true, status: "APPROVED" });
    await expect(updateDocumentMetadata("document-1", { title: "Changed" }, "admin-1"))
      .rejects.toThrow("Approved photo details cannot be edited");
  });
  it("trashes every photo revision before removing metadata, then permanently deletes files", async () => {
    mocks.get.mockResolvedValueOnce({ id: "new", category: "IMAGES", versionGroupId: "group-1" });
    mocks.history.mockResolvedValueOnce([
      { id: "new", status: "DRAFT", googleDriveFileId: "file-2" },
      { id: "old", status: "REJECTED", googleDriveFileId: "file-1" },
    ]);
    await deletePhotoHistory("new", "admin-1");
    expect(mocks.setDriveFileTrashed).toHaveBeenCalledWith({}, "file-2", true);
    expect(mocks.setDriveFileTrashed).toHaveBeenCalledWith({}, "file-1", true);
    expect(mocks.removeVersionGroup).toHaveBeenCalledWith("group-1", ["new", "old"], "admin-1");
    expect(mocks.deleteDriveFile).toHaveBeenCalledTimes(2);
  });
  it("restores staged Drive files if photo metadata deletion fails", async () => {
    mocks.get.mockResolvedValueOnce({ id: "new", category: "IMAGES", versionGroupId: "group-1" });
    mocks.history.mockResolvedValueOnce([{ id: "new", status: "DRAFT", googleDriveFileId: "file-2" }]);
    mocks.removeVersionGroup.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(deletePhotoHistory("new", "admin-1")).rejects.toThrow("database unavailable");
    expect(mocks.setDriveFileTrashed).toHaveBeenCalledWith({}, "file-2", false);
    expect(mocks.deleteDriveFile).not.toHaveBeenCalled();
  });
  it("never stages an approved photo for deletion", async () => {
    mocks.get.mockResolvedValueOnce({ id: "new", category: "IMAGES", versionGroupId: "group-1" });
    mocks.history.mockResolvedValueOnce([{ id: "old", status: "APPROVED", googleDriveFileId: "file-1" }]);
    await expect(deletePhotoHistory("new", "admin-1")).rejects.toThrow("Approved photos cannot be deleted");
    expect(mocks.setDriveFileTrashed).not.toHaveBeenCalled();
  });
});
