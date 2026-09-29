import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ProjectDocuments } from "./ProjectDocuments";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const drawing = {
  id: "document-1",
  projectId: "project-1",
  uploadedBy: "admin-1",
  fileName: "ground-floor.pdf",
  fileType: "application/pdf",
  fileSize: 2048,
  category: "DRAWINGS",
  googleDriveFileId: "drive-1",
  googleDriveFolderId: "folder-1",
  version: 1,
  revisionNote: null,
  isLatest: true,
  versionGroupId: "group-1",
  createdAt: "2026-09-29T10:00:00.000Z",
  updatedAt: "2026-09-29T10:00:00.000Z",
  links: { viewUrl: "https://drive.test/view/1", downloadUrl: "https://drive.test/download/1" },
  uploader: { id: "admin-1", name: "Administrator", email: "admin@example.test" },
};
const photo = {
  ...drawing,
  id: "document-2",
  fileName: "site.jpg",
  fileType: "image/jpeg",
  category: "IMAGES",
  links: { viewUrl: "https://drive.test/view/2", downloadUrl: "https://drive.test/download/2" },
};

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

describe("Project Documents workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/projects/project-1/documents" && !options?.method)
        return [drawing, photo] as never;
      if (path === "/projects/project-1/documents" && options?.method === "POST")
        return drawing as never;
      if (path === "/documents/document-1" && options?.method === "DELETE")
        return undefined as never;
      if (path === "/documents/document-1/versions" && !options?.method)
        return [
          {
            ...drawing,
            id: "document-3",
            fileName: "ground-floor-r2.pdf",
            version: 2,
            revisionNote: "Engineer review",
          },
          { ...drawing, isLatest: false },
        ] as never;
      if (path === "/documents/document-1/revision" && options?.method === "POST")
        return { ...drawing, id: "document-3", version: 2 } as never;
      throw new Error(`Unexpected request ${path}`);
    });
  });

  it("lists, filters and exposes the correct preview and download actions", async () => {
    renderDocuments();
    expect(await screen.findByText("ground-floor.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("V1")[0]).toBeInTheDocument();
    expect(screen.getByText("site.jpg")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Preview" })[0]).toHaveAttribute(
      "href",
      "https://drive.test/view/1",
    );

    fireEvent.change(screen.getByLabelText("Filter document category"), {
      target: { value: "IMAGES" },
    });
    expect(screen.queryByText("ground-floor.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("site.jpg")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "site.jpg thumbnail" })).toHaveAttribute(
      "src",
      "https://drive.test/download/2",
    );
  });

  it("shows version history and uploads a revision with its note", async () => {
    renderDocuments();
    await screen.findByText("ground-floor.pdf");
    fireEvent.click(screen.getAllByRole("button", { name: "Version History" })[0]);
    const history = await screen.findByRole("dialog", { name: "Version History" });
    expect(await within(history).findByText("Version 2")).toBeInTheDocument();
    expect(within(history).getByText("Engineer review")).toBeInTheDocument();
    expect(within(history).getAllByText("Administrator")).toHaveLength(2);
    fireEvent.click(within(history).getByRole("button", { name: "Close version history" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Upload New Revision" })[0]);
    const revisionDialog = screen.getByRole("dialog", { name: "Upload New Revision" });
    const revisedFile = new File(["revision"], "ground-floor-r2.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(within(revisionDialog).getByLabelText(/Revised file/), {
      target: { files: [revisedFile] },
    });
    fireEvent.change(within(revisionDialog).getByLabelText("Revision note (optional)"), {
      target: { value: "Engineer review" },
    });
    fireEvent.click(within(revisionDialog).getByRole("button", { name: "Upload Revision" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/documents/document-1/revision",
        expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
      ),
    );
    const revisionCall = vi.mocked(api).mock.calls.find(
      ([path]) => path === "/documents/document-1/revision",
    );
    const body = revisionCall?.[1]?.body as FormData;
    expect(body.get("file")).toBe(revisedFile);
    expect(body.get("revisionNote")).toBe("Engineer review");
  });

  it("uploads multipart data and confirms deletion", async () => {
    renderDocuments();
    await screen.findByText("ground-floor.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Upload Document" }));
    const dialog = screen.getByRole("dialog", { name: "Upload Document" });
    const file = new File(["drawing"], "revision.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(within(dialog).getByLabelText(/File/), {
      target: { files: [file] },
    });
    fireEvent.change(within(dialog).getByLabelText("Category"), {
      target: { value: "REPORTS" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload Document" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/projects/project-1/documents",
        expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
      ),
    );
    const uploadCall = vi.mocked(api).mock.calls.find(([, options]) => options?.method === "POST");
    const form = uploadCall?.[1]?.body as FormData;
    expect(form.get("file")).toBe(file);
    expect(form.get("category")).toBe("REPORTS");

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    const confirmation = screen.getByRole("alertdialog", { name: "Delete document?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete Document" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/documents/document-1", {
        method: "DELETE",
      }),
    );
  });

  it("rejects unsupported and oversized files before upload", async () => {
    renderDocuments();
    await screen.findByText("ground-floor.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Upload Document" }));
    const dialog = screen.getByRole("dialog", { name: "Upload Document" });
    const input = within(dialog).getByLabelText(/File/);

    fireEvent.change(input, {
      target: {
        files: [new File(["unsafe"], "payload.exe", { type: "application/octet-stream" })],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a PDF, Word, Excel, PNG or JPEG file.",
    );

    const oversized = new File(["pdf"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The file must be 25 MB or smaller.",
    );
    expect(vi.mocked(api).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
});
