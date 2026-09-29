import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EstimateForm } from "./EstimateForm";
import type { Client, Project } from "../types";

const api = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api,
}));

const context = {
  client: { id: "11111111-1111-4111-8111-111111111111", name: "Client" } as Client,
  project: {
    id: "22222222-2222-4222-8222-222222222222",
    clientId: "11111111-1111-4111-8111-111111111111",
    projectName: "Project",
  } as Project,
};
const source = {
  id: "33333333-3333-4333-8333-333333333333",
  clientId: context.client.id,
  projectId: context.project.id,
  number: "ODN-EST-0007",
  description: "Previous concrete work",
  estimateDate: "2026-09-27T00:00:00.000Z",
  currency: "USD",
  items: [
    { description: "Concrete", unit: "m³", quantity: 2, rate: 100 },
    { description: "Steel", unit: "kg", quantity: 3, rate: 50 },
  ],
};
function setup(onSave = vi.fn().mockResolvedValue(undefined)) {
  api.mockResolvedValue({ data: [source], total: 1, page: 1, pageSize: 20 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EstimateForm context={context} allowItemImport onSave={onSave} />
    </QueryClientProvider>,
  );
  return onSave;
}
describe("copy items into a new project estimate", () => {
  it("imports all item fields, updates totals, and passes the source ID on save", async () => {
    const save = setup();
    fireEvent.click(screen.getByLabelText("Copy items from previous estimate"));
    expect(await screen.findByText("ODN-EST-0007")).toBeInTheDocument();
    expect(screen.getByText("Previous concrete work")).toBeInTheDocument();
    expect(screen.getByText(/27\/09\/2026 · 2 items · USD/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Estimate Description"), {
      target: { value: "New work" },
    });
    fireEvent.change(screen.getByLabelText("Description 1"), {
      target: { value: "Draft item" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save estimate →" }));
    expect(await screen.findByText("Import items from a previous estimate before saving.")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/ODN-EST-0007/));
    fireEvent.click(screen.getByRole("button", { name: "Import Items" }));
    expect(screen.getByLabelText("Description 1")).toHaveValue("Concrete");
    expect(screen.getByLabelText("Unit 1")).toHaveValue("m³");
    expect(screen.getByLabelText("Quantity 1")).toHaveValue("2");
    expect(screen.getByLabelText("Rate 1")).toHaveValue("100");
    expect(screen.getByLabelText("Description 2")).toHaveValue("Steel");
    expect(screen.getByLabelText("Currency")).toHaveValue("USD");
    expect(screen.getAllByText(/350\.00/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "LKR" } });
    fireEvent.click(screen.getByRole("button", { name: "Save estimate →" }));
    expect(await screen.findByText(/Copied unit rates must keep the source currency/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "USD" } });
    fireEvent.click(screen.getByRole("button", { name: "Save estimate →" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].items).toEqual(source.items);
    expect(save.mock.calls[0][0].currency).toBe("USD");
    expect(save.mock.calls[0][1]).toBe(source.id);
  });
  it("restores blank items and clears the source when switched back", async () => {
    const save = setup();
    fireEvent.click(screen.getByLabelText("Copy items from previous estimate"));
    expect(await screen.findByText("ODN-EST-0007")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/ODN-EST-0007/));
    fireEvent.click(screen.getByRole("button", { name: "Import Items" }));
    fireEvent.click(screen.getByLabelText("Start blank estimate"));
    expect(screen.getByLabelText("Description 1")).toHaveValue("");
    expect(screen.queryByLabelText("Description 2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toHaveValue("LKR");
    fireEvent.change(screen.getByLabelText("Estimate Description"), {
      target: { value: "New work" },
    });
    fireEvent.change(screen.getByLabelText("Description 1"), {
      target: { value: "Fresh item" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save estimate →" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1]).toBeUndefined();
  });
});
