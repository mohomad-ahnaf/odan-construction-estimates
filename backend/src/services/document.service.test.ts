import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  listForProject: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
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
    create: mocks.create,
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
    mocks.create.mockImplementation(async (input) => ({ id: "document-1", ...input }));
    mocks.deleteDriveFile.mockResolvedValue(true);
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
    const stored = mocks.create.mock.calls[0]![0];
    expect(stored).toMatchObject({
      projectId: "project-1",
      uploadedBy: "user-1",
      googleDriveFileId: "drive-file-1",
      googleDriveFolderId: "folder-other",
    });
    expect(stored).not.toHaveProperty("buffer");
    expect(result.links.viewUrl).toBe("view/drive-file-1");
  });

  it("removes the Drive file if the metadata transaction fails", async () => {
    mocks.create.mockRejectedValueOnce(new Error("database unavailable"));
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
});
