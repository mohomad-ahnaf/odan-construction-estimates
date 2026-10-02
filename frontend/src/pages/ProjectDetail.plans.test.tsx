import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ProjectDetail } from "./ProjectDetail";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  apiBlob: vi.fn(),
  money: (value: string, currency: string) => `${currency} ${value}`,
}));
vi.mock("../auth", () => ({
  useAuth: () => ({ session: { user: { role: "ADMIN" } } }),
}));

it("opens the ADMIN Plans workspace from the existing Project detail", async () => {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path === "/projects/project")
      return { id: "project", clientId: "client", projectName: "Residence", status: "ACTIVE" } as never;
    if (path === "/clients/client")
      return { id: "client", name: "Customer", active: true } as never;
    if (path.startsWith("/projects/project/estimates"))
      return { data: [], total: 0, page: 1, pageSize: 20 } as never;
    if (path === "/projects/project/plans") return [] as never;
    if (path === "/projects/project/plan-measurements") return [] as never;
    throw new Error(`Unexpected path ${path}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/projects/project"]}>
        <Routes><Route path="/projects/:id" element={<ProjectDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole("tab", { name: "Plans" }));
  expect(await screen.findByText("No drawing plans available")).toBeInTheDocument();
  expect(screen.getByText(/Upload a PDF, PNG or JPEG/)).toBeInTheDocument();
});
