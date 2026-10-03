import { afterEach, describe, expect, it, vi } from "vitest";
import { api, apiBlob, setCsrf } from "./api";

afterEach(() => { vi.unstubAllGlobals(); setCsrf(""); });

describe("same-origin API requests", () => {
  it("keeps JSON requests on the Vite proxy path with cookies and CSRF", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }),
      { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    setCsrf("test-csrf");
    await api("/projects", { method: "POST", body: JSON.stringify({ name: "Test" }) });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects", expect.objectContaining({
      credentials: "same-origin", headers: expect.objectContaining({ "x-csrf-token": "test-csrf" }),
    }));
  });
  it("keeps private image reads and multipart uploads on the same origin", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(new Blob(["image"])));
    vi.stubGlobal("fetch", fetchMock);
    await apiBlob("/documents/document-id/content");
    const form = new FormData(); form.append("category", "IMAGES");
    await apiBlob("/projects/project-id/documents", { method: "POST", body: form });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/documents/document-id/content");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/projects/project-id/documents");
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ credentials: "same-origin" }));
    expect(fetchMock.mock.calls[1]?.[1].headers).not.toHaveProperty("Content-Type");
  });
});
