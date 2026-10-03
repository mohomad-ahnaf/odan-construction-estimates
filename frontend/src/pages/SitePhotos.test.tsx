import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiBlob } from "../lib/api";
import { SitePhotos, validateSitePhoto } from "./SitePhotos";

vi.mock("../lib/api", () => ({ api: vi.fn(), apiBlob: vi.fn() }));
const first = { id: "project-1", projectName: "Harbour works", clientName: "Harbour client",
  projectCode: "ODN-PRJ-0001", clientId: "client-1", status: "ACTIVE" as const };
const second = { ...first, id: "project-2", projectName: "Hill works", projectCode: "ODN-PRJ-0002" };
const photo = { id: "photo-1", projectId: first.id, uploadedBy: "admin-1", fileName: "arrival.jpg",
  title: "Site arrival", description: "North gate", fileType: "image/jpeg", fileSize: 1024,
  category: "IMAGES", googleDriveFileId: "drive-1", googleDriveFolderId: "folder-1", version: 1,
  revisionNote: null, isLatest: true, versionGroupId: "group-1", status: "DRAFT",
  createdAt: "2026-10-03T08:00:00.000Z", updatedAt: "2026-10-03T08:00:00.000Z",
  uploader: { id: "admin-1", name: "Administrator", email: "admin@example.test" },
  links: { viewUrl: "private", downloadUrl: "private" } };
let firstDocuments: (typeof photo | (Omit<typeof photo, "title"> & { title: string | null }))[] = [photo];
let uploads: { projectId: string; fileName: string }[] = [];
let failName = "";

function renderPage(start = "/site-photos?projectId=project-1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: "/site-photos", element: <SitePhotos /> }], { initialEntries: [start] });
  return { router, ...render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>) };
}

beforeEach(() => {
  vi.clearAllMocks(); uploads = []; failName = ""; firstDocuments = [photo];
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:site-photo") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.mocked(apiBlob).mockResolvedValue(new Blob(["photo"], { type: "image/jpeg" }));
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path.startsWith("/projects?") && !options?.method)
      return { data: [first, second], total: 2, page: 1, pageSize: 20 } as never;
    if (path === "/projects/project-1" && !options?.method) return first as never;
    if (path === "/projects/project-2" && !options?.method) return second as never;
    if (path === "/projects/project-1/documents" && !options?.method) return firstDocuments as never;
    if (path === "/projects/project-2/documents" && !options?.method) return [] as never;
    if (path.endsWith("/documents") && options?.method === "POST") {
      const file = (options.body as FormData).get("file") as File;
      const projectId = path.split("/")[2]!;
      uploads.push({ projectId, fileName: file.name });
      if (failName === file.name) { failName = ""; throw new Error("Network unavailable; retry upload"); }
      if (projectId === first.id) firstDocuments = [{ ...photo, id: `photo-${file.name}`, fileName: file.name,
        title: (options.body as FormData).get("title") as string | null,
        createdAt: new Date().toISOString() }, ...firstDocuments];
      return photo as never;
    }
    if (path === "/documents/photo-1/metadata" && options?.method === "PATCH") {
      const input = JSON.parse(String(options.body)); firstDocuments = [{ ...photo, ...input }]; return firstDocuments[0] as never;
    }
    if (path === "/documents/photo-1/revision" && options?.method === "POST") {
      const original = firstDocuments.find((item) => item.id === "photo-1")!;
      firstDocuments = [{ ...original, id: "photo-2", version: 2, status: "DRAFT", fileName: "replacement.png",
        createdAt: new Date().toISOString() }, ...firstDocuments.filter((item) => item.id !== "photo-1")];
      return firstDocuments[0] as never;
    }
    if (path === "/documents/photo-1/versions" && !options?.method) return [photo] as never;
    if ((path === "/documents/photo-1/photo-history" || path === "/documents/photo-2/photo-history") && options?.method === "DELETE") {
      firstDocuments = []; return undefined as never;
    }
    throw new Error(`Unexpected request ${path}`);
  });
});

describe("Site Photos", () => {
  it("releases local previews when a queued file is removed and explains unsupported formats", async () => {
    renderPage(); await screen.findByText("Site arrival");
    const image = new File(["image"], "field.jpg", { type: "image/jpeg" });
    const unsupported = new File(["image"], "phone.heic", { type: "image/heic" });
    fireEvent.change(screen.getByLabelText("Choose Photos file input"), { target: { files: [image, unsupported] } });
    expect(screen.getByText(/HEIC\/HEIF and other phone formats/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove field.jpg" }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:site-photo"));
  });
  it("validates phone formats and previews private images under the selected project", async () => {
    expect(validateSitePhoto(new File(["image"], "phone.heic", { type: "image/heic" }))).toMatch(/HEIC/);
    const { router } = renderPage();
    expect(await screen.findByText("Site arrival")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Documents/ })).toHaveAttribute("href", "/projects/project-1?tab=documents&category=IMAGES");
    fireEvent.click(screen.getByRole("button", { name: "Preview Site arrival" }));
    expect(await screen.findByRole("img", { name: "Site arrival" })).toHaveAttribute("src", "blob:site-photo");
    expect(apiBlob).toHaveBeenCalledWith("/documents/photo-1/content");
    fireEvent.click(screen.getByRole("button", { name: "Close Site arrival" }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
    expect(router.state.location.search).toBe("?projectId=project-1");
  });
  it("opens previews from thumbnails and closes the action menu on outside click or Escape", async () => {
    renderPage(); await screen.findByText("Site arrival");
    fireEvent.click(screen.getByRole("button", { name: "Open photo preview: Site arrival" }));
    expect(await screen.findByRole("dialog", { name: "Site arrival" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Site arrival" }));
    const more = screen.getByRole("button", { name: "More actions for Site arrival" });
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Revision history" })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("heading", { name: "Project gallery" }));
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(more).toHaveAttribute("aria-expanded", "false");
  });
  it("moves uploads and replacement revisions into their local upload-date section", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    firstDocuments = [{ ...photo, createdAt: yesterday.toISOString() }];
    renderPage(); await screen.findByText("Site arrival");
    expect(screen.getByRole("region", { name: "Yesterday, 1 photo" })).toBeInTheDocument();
    const upload = new File(["image"], "today.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Choose Photos file input"), { target: { files: [upload] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload 1 Photo" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Today, 1 photo" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "More actions for Site arrival" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace photo" }));
    fireEvent.change(screen.getByLabelText("Replacement JPEG or PNG"),
      { target: { files: [new File(["image"], "replacement.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload revision" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Yesterday, 1 photo" })).not.toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Today, 2 photos" })).toBeInTheDocument();
  });
  it("handles multiple selection, drop, partial failure, retry, and per-file project binding", async () => {
    failName = "b.jpg";
    const { router } = renderPage();
    await screen.findByText("Site arrival");
    const a = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const b = new File(["b"], "b.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Choose Photos file input"), { target: { files: [a, b] } });
    fireEvent.drop(screen.getByRole("button", { name: "Drop photos here or browse" }),
      { dataTransfer: { files: [a] } });
    expect(screen.getAllByText("a.jpg")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Upload 2 Photos" }));
    await waitFor(() => expect(screen.getByText("Network unavailable; retry upload")).toBeInTheDocument());
    expect(uploads).toEqual([{ projectId: first.id, fileName: "a.jpg" }, { projectId: first.id, fileName: "b.jpg" }]);
    fireEvent.click(screen.getByRole("button", { name: "Retry 1 Failed Photo" }));
    await waitFor(() => expect(uploads).toHaveLength(3));
    expect(uploads.filter((item) => item.fileName === "a.jpg")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Hill works/ }));
    expect(router.state.location.search).toBe("?projectId=project-2");
    await screen.findByText("Photos are stored in this project's Documents → Images.");
    const c = new File(["c"], "c.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose Photos file input"), { target: { files: [c] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload 1 Photo" }));
    await waitFor(() => expect(uploads.at(-1)).toEqual({ projectId: second.id, fileName: "c.png" }));
  });
  it("requires confirmation on project switch and keeps queued photos with their original project", async () => {
    const { router } = renderPage(); await screen.findByText("Site arrival");
    const queued = new File(["image"], "queued.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Choose Photos file input"), { target: { files: [queued] } });
    fireEvent.click(screen.getByRole("button", { name: /Hill works/ }));
    expect(screen.getByRole("dialog", { name: "Switch project?" })).toBeInTheDocument();
    expect(router.state.location.search).toBe("?projectId=project-1");
    fireEvent.click(screen.getByRole("button", { name: "Switch and keep queue" }));
    expect(router.state.location.search).toBe("?projectId=project-2");
    expect(screen.queryByText("queued.jpg")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Harbour works/ }));
    expect(await screen.findByText("queued.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Upload 1 Photo" }));
    await waitFor(() => expect(uploads).toEqual([{ projectId: first.id, fileName: "queued.jpg" }]));
  });
  it("edits display metadata, replaces a revision, and removes the photo history", async () => {
    renderPage(); await screen.findByText("Site arrival");
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    const dialog = screen.getByRole("dialog", { name: "Edit photo details" });
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "New title" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(screen.getByText("New title")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "More actions for New title" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace photo" }));
    fireEvent.change(screen.getByLabelText("Replacement JPEG or PNG"), { target: { files: [new File(["png"], "replacement.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload revision" }));
    await waitFor(() => expect(screen.getByText(/V2/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "More actions for New title" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete site photo?" })).toHaveTextContent("entire revision history");
    fireEvent.click(screen.getByRole("button", { name: "Delete photo and history" }));
    await waitFor(() => expect(screen.getByText(/No site photos yet/)).toBeInTheDocument());
    expect(api).toHaveBeenCalledWith("/documents/photo-2/photo-history", { method: "DELETE" });
  });
});
