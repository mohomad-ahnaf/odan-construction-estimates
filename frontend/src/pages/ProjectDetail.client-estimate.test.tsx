import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProjectDetail } from "./ProjectDetail";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  money: (value: string, currency: string) => `${currency} ${value}`,
}));
vi.mock("../auth", () => ({
  useAuth: () => ({ session: { user: { role: "ADMIN" } } }),
}));

it("shows saved Client Estimates under their Project tab", async () => {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path === "/projects/project")
      return {
        id: "project",
        clientId: "client",
        projectName: "Residence",
        projectCode: "ODN-PRJ-0001",
        status: "ACTIVE",
      } as never;
    if (path === "/clients/client")
      return {
        id: "client",
        name: "Customer",
        clientCode: "ODN-CLI-0001",
        active: true,
      } as never;
    if (path.startsWith("/projects/project/client-estimates"))
      return {
        data: [
          {
            id: "summary",
            clientEstimateNumber: "ODN-CE-0001",
            clientEstimateDate: "2026-09-28T00:00:00.000Z",
            title: "Customer summary",
            status: "DRAFT",
            items: [{}, {}],
            grandTotal: "300.00",
            currency: "LKR",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      } as never;
    if (path.startsWith("/projects/project/estimates"))
      return {
        data: [
          {
            id: "estimate",
            number: "ODN-EST-0001",
            title: "Residence",
            description: "Ground Floor Construction",
            estimateDate: "2026-09-28T00:00:00.000Z",
            status: "DRAFT",
            updatedAt: "2026-09-28T00:00:00.000Z",
            totals: { total: "300.00" },
            currency: "LKR",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      } as never;
    throw new Error(`Unexpected path ${path}`);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/projects/project"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText("Ground Floor Construction"),
  ).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("tab", { name: "Client Estimates" }));
  expect(await screen.findByText("ODN-CE-0001")).toBeInTheDocument();
  expect(screen.getByText("Customer summary")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Create Client Estimate" }),
  ).toHaveAttribute("href", "/projects/project/client-estimates/new");
  expect(screen.getByText("LKR 300.00")).toBeInTheDocument();
});
