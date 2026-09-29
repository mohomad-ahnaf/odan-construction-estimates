import { expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClientEstimateForm } from "./ClientEstimateForm";
import { api } from "../lib/api";
import type { Client, ClientEstimate, Estimate, Project } from "../types";

vi.mock("../lib/api", async (load) => {
  const original = await load<typeof import("../lib/api")>();
  return { ...original, api: vi.fn() };
});

const client = {
  id: "client",
  name: "Customer",
  clientCode: "ODN-CLI-0001",
} as Client;
const project = {
  id: "project",
  clientId: "client",
  projectName: "Residence",
  projectCode: "ODN-PRJ-0001",
} as Project;
const sources = [
  {
    id: "source-a",
    projectId: "project",
    clientId: "client",
    number: "ODN-EST-0001",
    title: "Residence",
    description: "Foundation",
    currency: "LKR",
    status: "DRAFT",
    totals: { total: "100.00" },
  },
  {
    id: "source-b",
    projectId: "project",
    clientId: "client",
    number: "ODN-EST-0002",
    title: "Residence",
    description: "Roof",
    currency: "LKR",
    status: "SENT",
    totals: { total: "200.00" },
  },
] as Estimate[];

function renderForm(
  initial?: ClientEstimate,
  onSave = vi.fn().mockResolvedValue(undefined),
) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <ClientEstimateForm
        client={client}
        project={project}
        initial={initial}
        onSave={onSave}
      />
    </QueryClientProvider>,
  );
  return onSave;
}

it("selects Project estimates and previews an exact Grand Total", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.startsWith("/projects/project/estimates"))
      return { data: sources, total: 2, page: 1, pageSize: 20 } as never;
    throw new Error("Unexpected request");
  });
  const save = renderForm();
  fireEvent.change(screen.getByLabelText("Title / Description"), {
    target: { value: "Customer summary" },
  });
  fireEvent.click(await screen.findByLabelText("Select ODN-EST-0001"));
  fireEvent.click(screen.getByLabelText("Select ODN-EST-0002"));
  const preview = screen
    .getByText("Selected-estimate preview")
    .closest("section")!;
  expect(within(preview).getByText("Foundation")).toBeInTheDocument();
  expect(within(preview).getByText("Roof")).toBeInTheDocument();
  expect(within(preview).queryByText("Residence")).not.toBeInTheDocument();
  expect(within(preview).getByText(/300\.00/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save Client Estimate" }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0][0].items).toEqual([
    { sourceEstimateId: "source-a" },
    { sourceEstimateId: "source-b" },
  ]);
});

it("keeps a saved snapshot until Refresh snapshot is explicitly selected", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.startsWith("/projects/project/estimates"))
      return { data: sources, total: 2, page: 1, pageSize: 20 } as never;
    if (path === "/estimates/source-a")
      return { ...sources[0], totals: { total: "250.00" } } as never;
    throw new Error("Unexpected request");
  });
  const saved = {
    clientEstimateDate: "2026-09-28T00:00:00.000Z",
    title: "Saved summary",
    notes: "",
    items: [
      {
        id: "row",
        sourceEstimateId: "source-a",
        estimateNumberSnapshot: "ODN-EST-0001",
        descriptionSnapshot: "Saved title",
        currencySnapshot: "LKR",
        quantity: 1,
        rateSnapshot: "100.00",
        amountSnapshot: "100.00",
      },
    ],
  } as ClientEstimate;
  const save = renderForm(saved);
  const preview = screen
    .getByText("Selected-estimate preview")
    .closest("section")!;
  expect(within(preview).getByText("Saved title")).toBeInTheDocument();
  expect(within(preview).getAllByText(/100\.00/)).toHaveLength(3);
  fireEvent.click(
    within(preview).getByRole("button", { name: "Refresh snapshot" }),
  );
  await waitFor(() =>
    expect(within(preview).getAllByText(/250\.00/)).toHaveLength(3),
  );
  expect(within(preview).getByText("Foundation")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save Client Estimate" }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0][0].items).toEqual([
    { sourceEstimateId: "source-a", refreshSnapshot: true },
  ]);
});
