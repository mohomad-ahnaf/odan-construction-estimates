import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { api } from "../lib/api";
vi.mock("../lib/api", () => ({
  api: vi.fn(),
  money: (value: string, currency: string) => `${currency} ${value}`,
}));
vi.mock("../auth", () => ({
  useAuth: () => ({ session: { user: { role: "ADMIN" } } }),
}));
const view = (
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, throwOnError: false, retryOnMount: false },
    },
  }),
) =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
beforeEach(() => vi.mocked(api).mockReset());
describe("Dashboard", () => {
  it("shows a retry action when the client list fails", async () => {
    vi.mocked(api).mockImplementation(async (path: string) =>
      path === "/dashboard"
        ? {
            activeProjects: 0,
            activeClients: 0,
            totalEstimates: 0,
            approvedTotalsByCurrency: {},
            recentEstimates: [],
          }
        : { data: [], total: 0, page: 1, pageSize: 20 },
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    client
      .getQueryCache()
      .build(client, {
        queryKey: ["clients", "", 1],
        queryFn: async () => ({ data: [], total: 0, page: 1, pageSize: 20 }),
      })
      .setState({
        status: "error",
        error: new Error("Unavailable"),
        fetchStatus: "idle",
      });
    view(client);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
  it("shows loading state", async () => {
    vi.mocked(api).mockImplementation(
      (path: string) =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                path === "/dashboard"
                  ? {
                      activeProjects: 0,
                      activeClients: 0,
                      totalEstimates: 0,
                      approvedTotalsByCurrency: {},
                      recentEstimates: [],
                    }
                  : { data: [], total: 0, page: 1, pageSize: 20 },
              ),
            50,
          ),
        ),
    );
    view();
    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
    await screen.findByText("No clients yet.");
  });
  it("shows empty state and summary counts", async () => {
    vi.mocked(api).mockImplementation(async (path: string) =>
      path === "/dashboard"
        ? {
            activeProjects: 0,
            activeClients: 0,
            totalEstimates: 0,
            approvedTotalsByCurrency: {},
            recentEstimates: [],
          }
        : { data: [], total: 0, page: 1, pageSize: 20 },
    );
    view();
    expect(await screen.findByText("No clients yet.")).toBeInTheDocument();
    expect(screen.getByText("No estimates yet.")).toBeInTheDocument();
    expect(screen.getByText("Approved Estimate Value")).toBeInTheDocument();
  });
  it("shows client and estimate data", async () => {
    vi.mocked(api).mockImplementation(async (path: string) =>
      path === "/dashboard"
        ? {
            activeProjects: 1,
            activeClients: 1,
            totalEstimates: 1,
            approvedTotalsByCurrency: { LKR: "100.00" },
            recentEstimates: [
              {
                id: "e",
                number: "OD-1",
                clientName: "Client A",
                projectTitle: "Residence",
                estimateDate: null,
                createdAt: "2026-09-27T00:00:00Z",
                status: "APPROVED",
                currency: "LKR",
                grandTotal: "100.00",
              },
            ],
          }
        : {
            data: [
              {
                id: "c",
                name: "Client A",
                contactPerson: "Person",
                telephone: "123",
                email: "a@example.com",
                projectCount: 1,
                estimateCount: 1,
                totalsByCurrency: { LKR: "100.00" },
                active: true,
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          },
    );
    view();
    expect((await screen.findAllByText("Client A")).length).toBeGreaterThan(0);
    expect(screen.getByText("OD-1")).toBeInTheDocument();
  });
});
