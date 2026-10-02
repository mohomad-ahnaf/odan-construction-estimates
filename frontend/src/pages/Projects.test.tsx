import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth";
import { Layout } from "../components/Layout";
import { api } from "../lib/api";
import { Projects } from "./Projects";

vi.mock("../lib/api", () => ({ api: vi.fn(), setCsrf: vi.fn() }));

const clientId = "11111111-1111-4111-8111-111111111111";
const project = {
  id: "22222222-2222-4222-8222-222222222222",
  clientId,
  projectName: "Harbour Office",
  projectCode: "ODN-PRJ-0001",
  clientName: "Coastal Holdings",
  clientCode: "ODN-CLI-0001",
  clientActive: true,
  siteAddress: "Colombo",
  description: "Office fit-out",
  startDate: "2026-10-01",
  status: "ACTIVE",
  estimateCount: 3,
};

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("Projects directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
  });

  it("lists real projects, filters them and opens the existing project route", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.startsWith("/clients?"))
        return {
          data: [{ id: clientId, name: "Coastal Holdings" }],
          total: 1,
          page: 1,
          pageSize: 100,
        } as never;
      if (path.startsWith("/projects?"))
        return { data: [project], total: 1, page: 1, pageSize: 20 } as never;
      throw new Error(`Unexpected request ${path}`);
    });

    render(
      <QueryClientProvider client={queryClient()}>
        <MemoryRouter initialEntries={["/projects"]}>
          <Routes>
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<h1>Existing Project Workspace</h1>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Harbour Office")).toBeInTheDocument();
    expect(screen.getAllByText("Coastal Holdings")).toHaveLength(2);
    expect(screen.getByText("01/10/2026")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search projects"), {
      target: { value: "harbour" },
    });
    fireEvent.change(screen.getByLabelText("Filter projects by client"), {
      target: { value: clientId },
    });
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `/projects?search=harbour&page=1&clientId=${clientId}`,
      ),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Open project Harbour Office" }));
    expect(screen.getByRole("heading", { name: "Existing Project Workspace" })).toBeInTheDocument();
  });

  it("keeps Projects active while viewing a direct project URL", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/session")
        return {
          user: { id: "admin", name: "Administrator", email: "admin@example.test", role: "ADMIN" },
          csrfToken: "csrf",
        } as never;
      throw new Error(`Unexpected request ${path}`);
    });

    render(
      <QueryClientProvider client={queryClient()}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/projects/${project.id}`]}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/projects/:id" element={<p>Project detail</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    const projectsLink = await screen.findByRole("link", { name: /Projects/ });
    expect(projectsLink).toHaveClass("active");
    expect(screen.getByText("Project detail")).toBeInTheDocument();
  });
});
