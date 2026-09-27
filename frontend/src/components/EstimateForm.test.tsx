import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EstimateForm } from "./EstimateForm";
vi.mock("../lib/api", () => ({
  api: vi.fn(async (path: string) =>
    path.startsWith("/clients/")
      ? {
          data: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              projectName: "Residence",
            },
          ],
        }
      : {
          data: [
            { id: "11111111-1111-4111-8111-111111111111", name: "Client" },
          ],
        },
  ),
}));
const renderForm = (onSave: (data: any) => Promise<void>, initial?: any) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <EstimateForm onSave={onSave} initial={initial} />
    </QueryClientProvider>,
  );
describe("estimate form", () => {
  it("requires Client, Project and Estimate Date", async () => {
    const save = vi.fn();
    renderForm(save);
    fireEvent.click(screen.getByRole("button", { name: /Save estimate/ }));
    expect(await screen.findByText("Select a client")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("submits selected relationships and clears project on Client change", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderForm(save);
    await screen.findByRole("option", { name: "Client" });
    fireEvent.change(screen.getByLabelText("Client"), {
      target: { value: "11111111-1111-4111-8111-111111111111" },
    });
    await screen.findByRole("option", { name: "Residence" });
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: "22222222-2222-4222-8222-222222222222" },
    });
    fireEvent.change(screen.getByLabelText("Description 1"), {
      target: { value: "Excavation" },
    });
    fireEvent.change(screen.getByLabelText("Rate 1"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save estimate/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].clientId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(save.mock.calls[0][0].projectId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    fireEvent.change(screen.getByLabelText("Client"), {
      target: { value: "" },
    });
    expect(screen.getByLabelText("Project")).toHaveValue("");
  });
  it("retains values and reports failed save", async () => {
    renderForm(
      async () => {
        throw new Error("Estimate changed");
      },
      {
        clientId: "11111111-1111-4111-8111-111111111111",
        projectId: "22222222-2222-4222-8222-222222222222",
        estimateDate: "2026-09-27",
        currency: "LKR",
        taxPercent: 0,
        notes: "",
        items: [{ description: "Work", unit: "m²", quantity: 1, rate: 20 }],
      },
    );
    await screen.findByRole("option", { name: "Residence" });
    fireEvent.click(screen.getByRole("button", { name: /Save estimate/ }));
    expect(await screen.findByText("Estimate changed")).toBeInTheDocument();
    expect(screen.getByLabelText("Description 1")).toHaveValue("Work");
  });
});
