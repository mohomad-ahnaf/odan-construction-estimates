import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiBlob } from "../lib/api";
import { ProjectDocuments } from "./ProjectDocuments";

vi.mock("../lib/api", () => ({ api: vi.fn(), apiBlob: vi.fn() }));

const drawing = {
  id: "document-1", projectId: "project-1", uploadedBy: "admin-1",
  fileName: "ground-floor.pdf", fileType: "application/pdf", fileSize: 2048,
  category: "DRAWINGS", googleDriveFileId: "drive-1", googleDriveFolderId: "folder-1",
  version: 1, revisionNote: null, isLatest: true, versionGroupId: "group-1", status: "DRAFT",
  createdAt: "2026-09-29T10:00:00.000Z", updatedAt: "2026-09-29T10:00:00.000Z",
  links: { viewUrl: "https://drive.test/view/1", downloadUrl: "https://drive.test/download/1" },
  uploader: { id: "admin-1", name: "Administrator", email: "admin@example.test" },
};
const photo = {
  ...drawing, id: "document-2", fileName: "site.jpg", fileType: "image/jpeg", category: "IMAGES",
  links: { viewUrl: "https://drive.test/view/2", downloadUrl: "https://drive.test/download/2" },
};

let listedDocuments = [drawing, photo];
let failOnce = new Set<string>();
let uploadAttempts: string[] = [];

function renderDocuments() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProjectDocuments projectId="project-1" />
    </QueryClientProvider>,
  );
}

function openFirstActions() {
  fireEvent.click(screen.getAllByRole("button", { name: /Actions/ })[0]);
}

describe("Project Documents workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listedDocuments = [drawing, photo];
    failOnce = new Set();
    uploadAttempts = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:authenticated-document"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.mocked(apiBlob).mockResolvedValue(
      new Blob(["private document"], { type: "application/pdf" }),
    );
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/projects/project-1/documents" && !options?.method) return listedDocuments as never;
      if (path === "/projects/project-1/documents" && options?.method === "POST") {
        const file = (options.body as FormData).get("file") as File;
        uploadAttempts.push(file.name);
        if (failOnce.delete(file.name)) throw new Error(`Upload failed for ${file.name}`);
        return drawing as never;
      }
      if (path === "/documents/document-1" && options?.method === "DELETE") return undefined as never;
      if (path === "/documents/document-1/versions" && !options?.method)
        return [
          { ...drawing, id: "document-3", fileName: "ground-floor-r2.pdf", version: 2, revisionNote: "Engineer review" },
          { ...drawing, isLatest: false },
        ] as never;
      if (path === "/documents/document-1/revision" && options?.method === "POST")
        return { ...drawing, id: "document-3", version: 2 } as never;
      if (path === "/documents/document-1/submit" && options?.method === "POST") {
        const updated = { ...drawing, status: "PENDING_REVIEW" as const };
        listedDocuments = [updated, photo];
        return updated as never;
      }
      if (path === "/documents/document-1/reject" && options?.method === "POST") {
        const updated = { ...drawing, status: "REJECTED" as const };
        listedDocuments = [updated, photo];
        return updated as never;
      }
      if (path === "/documents/document-1/approval-history" && !options?.method)
        return [{
          id: "approval-1", documentId: "document-1", action: "SUBMITTED", comment: null,
          approvedBy: "admin-1", createdAt: "2026-09-30T01:00:00.000Z",
          approver: { id: "admin-1", name: "Administrator" },
        }] as never;
      throw new Error(`Unexpected request ${path}`);
    });
  });

  it("shows compact actions, an in-app preview and thumbnail fallback", async () => {
    renderDocuments();
    expect(await screen.findByText("ground-floor.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[0]);
    const preview = screen.getByRole("dialog", { name: "ground-floor.pdf" });
    expect(await within(preview).findByTitle("ground-floor.pdf preview")).toHaveAttribute(
      "src",
      "blob:authenticated-document",
    );
    expect(apiBlob).toHaveBeenCalledWith("/documents/document-1/content");
    fireEvent.click(within(preview).getByRole("button", { name: "Close document preview" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:authenticated-document");
    fireEvent.change(screen.getByLabelText("Filter document category"), { target: { value: "IMAGES" } });
    const thumbnail = await screen.findByRole("img", { name: "site.jpg thumbnail" });
    expect(thumbnail).toHaveAttribute("src", "blob:authenticated-document");
    expect(apiBlob).toHaveBeenCalledWith("/documents/document-2/content");
  });

  it("shows a thumbnail fallback when authenticated content cannot load", async () => {
    vi.mocked(apiBlob).mockRejectedValueOnce(new Error("Drive is unavailable"));
    renderDocuments();
    await screen.findByText("site.jpg");
    expect(await screen.findByRole("img", { name: "site.jpg preview unavailable" })).toBeInTheDocument();
  });

  it("closes an open Actions menu when clicking elsewhere", async () => {
    renderDocuments();
    await screen.findByText("ground-floor.pdf");
    const trigger = screen.getAllByRole("button", { name: /Actions/ })[0];
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(screen.getByRole("heading", { name: "Project Documents" }));
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
  });

  it("adds multiple selections, avoids duplicates and uploads sequentially", async () => {
    renderDocuments();
    await screen.findByText("ground-floor.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Upload Document" }));
    const dialog = screen.getByRole("dialog", { name: "Upload Document" });
    const first = new File(["one"], "one.pdf", { type: "application/pdf", lastModified: 1 });
    const second = new File(["two"], "two.pdf", { type: "application/pdf", lastModified: 2 });
    const chooser = within(dialog).getByLabelText("Choose document files");
    fireEvent.change(chooser, { target: { files: [first] } });
    fireEvent.change(chooser, { target: { files: [first, second] } });
    expect(within(dialog).getAllByText("one.pdf")).toHaveLength(1);
    expect(within(dialog).getByText("two.pdf")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload 2 Files" }));
    await waitFor(() => expect(uploadAttempts).toEqual(["one.pdf", "two.pdf"]));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Upload Document" })).not.toBeInTheDocument());
  });

  it("accepts drops and validates every file independently", async () => {
    renderDocuments();
    await screen.findByText("ground-floor.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Upload Document" }));
    const dialog = screen.getByRole("dialog", { name: "Upload Document" });
    const zone = within(dialog).getByRole("button", { name: /Drag and drop files here/ });
    const valid = new File(["pdf"], "valid.pdf", { type: "application/pdf" });
    const invalid = new File(["unsafe"], "payload.exe", { type: "application/octet-stream" });
    const oversized = new File(["pdf"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });
    fireEvent.dragOver(zone, { dataTransfer: { dropEffect: "none", files: [] } });
    expect(zone).toHaveClass("is-dragging");
    fireEvent.drop(zone, { dataTransfer: { files: [valid, invalid, oversized] } });
    expect(zone).not.toHaveClass("is-dragging");
    expect(within(dialog).getByText("Choose a PDF, Word, Excel, PNG or JPEG file.")).toBeInTheDocument();
    expect(within(dialog).getByText("The file must be 25 MB or smaller.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Upload 1 File" })).toBeEnabled();
  });

  it("continues after a partial failure and retries only failed files", async () => {
    failOnce.add("two.pdf");
    renderDocuments();
    await screen.findByText("ground-floor.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Upload Document" }));
    const dialog = screen.getByRole("dialog", { name: "Upload Document" });
    const files = ["one.pdf", "two.pdf", "three.pdf"].map(
      (name, index) => new File([name], name, { type: "application/pdf", lastModified: index }),
    );
    fireEvent.change(within(dialog).getByLabelText("Choose document files"), { target: { files } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload 3 Files" }));
    expect(await within(dialog).findByText("Upload failed for two.pdf")).toBeInTheDocument();
    await waitFor(() => expect(uploadAttempts).toEqual(["one.pdf", "two.pdf", "three.pdf"]));
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry 1 Failed File" }));
    await waitFor(() => expect(uploadAttempts).toEqual(["one.pdf", "two.pdf", "three.pdf", "two.pdf"]));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Upload Document" })).not.toBeInTheDocument());
  });

  it("keeps revision uploads to one dropped file and preserves metadata", async () => {
    renderDocuments();
    await screen.findByText("ground-floor.pdf");
    openFirstActions();
    fireEvent.click(screen.getAllByRole("button", { name: "Upload New Revision" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Upload New Revision" });
    const zone = within(dialog).getByRole("button", { name: /Drag and drop files here/ });
    const revision = new File(["revision"], "ground-floor-r2.pdf", { type: "application/pdf" });
    fireEvent.drop(zone, { dataTransfer: { files: [revision, new File(["x"], "extra.pdf", { type: "application/pdf" })] } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Choose exactly one file for a revision.");
    fireEvent.drop(zone, { dataTransfer: { files: [revision] } });
    fireEvent.change(within(dialog).getByLabelText("Revision note (optional)"), { target: { value: "Engineer review" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload Revision" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith(
      "/documents/document-1/revision",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    ));
    const call = vi.mocked(api).mock.calls.find(([path]) => path === "/documents/document-1/revision");
    const body = call?.[1]?.body as FormData;
    expect(body.get("file")).toBe(revision);
    expect(body.get("revisionNote")).toBe("Engineer review");
  });

  it("keeps version, workflow and delete actions available", async () => {
    renderDocuments();
    await screen.findByText("ground-floor.pdf");
    openFirstActions();
    fireEvent.click(screen.getAllByRole("button", { name: "Version History" })[0]);
    const history = await screen.findByRole("dialog", { name: "Version History" });
    expect(await within(history).findByText("Version 2")).toBeInTheDocument();
    fireEvent.click(within(history).getByRole("button", { name: "Close version history" }));
    openFirstActions();
    fireEvent.click(screen.getAllByRole("button", { name: "Submit for Review" })[0]);
    await waitFor(() => expect(api).toHaveBeenCalledWith("/documents/document-1/submit", { method: "POST", body: "{}" }));
    openFirstActions();
    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]);
    const reject = screen.getByRole("dialog", { name: "Reject Document" });
    fireEvent.change(within(reject).getByLabelText("Rejection comment"), { target: { value: "Correct dimensions" } });
    fireEvent.click(within(reject).getByRole("button", { name: "Reject Document" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/documents/document-1/reject", {
      method: "POST", body: JSON.stringify({ comment: "Correct dimensions" }),
    }));
    openFirstActions();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    const confirmation = screen.getByRole("alertdialog", { name: "Delete document?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete Document" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/documents/document-1", { method: "DELETE" }));
  });
});
