import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EstimateForm } from "./EstimateForm";
import type { Client, Project } from "../types";

const context = {
  client: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Client A",
    registrationNumber: "REG-A",
  } as Client,
  project: {
    id: "22222222-2222-4222-8222-222222222222",
    clientId: "11111111-1111-4111-8111-111111111111",
    projectName: "Residence",
    projectCode: "PROJ-A",
  } as Project,
};
describe("Project-scoped estimate form", () => {
  it("shows locked Client and Project context and requires estimate date", async () => {
    const save = vi.fn();
    render(
      <EstimateForm
        context={context}
        initial={{
          estimateDate: "",
          currency: "LKR",
          taxPercent: 0,
          notes: "",
          items: [{ description: "Work", unit: "m²", quantity: 1, rate: 20 }],
        }}
        onSave={save}
      />,
    );
    expect(screen.getByText(/Client A/)).toBeInTheDocument();
    expect(screen.getByText(/Residence/)).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Client" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Project" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save estimate/ }));
    expect(
      await screen.findByText("Enter an estimate date"),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("submits estimate fields without relationship IDs", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<EstimateForm context={context} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Description 1"), {
      target: { value: "Excavation" },
    });
    fireEvent.change(screen.getByLabelText("Rate 1"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save estimate/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).not.toHaveProperty("clientId");
    expect(save.mock.calls[0][0]).not.toHaveProperty("projectId");
  });
  it("retains values after a failed save", async () => {
    render(
      <EstimateForm
        context={context}
        initial={{
          estimateDate: "2026-09-27",
          currency: "LKR",
          taxPercent: 0,
          notes: "",
          items: [{ description: "Work", unit: "m²", quantity: 1, rate: 20 }],
        }}
        onSave={async () => {
          throw new Error("Estimate changed");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Save estimate/ }));
    expect(await screen.findByText("Estimate changed")).toBeInTheDocument();
    expect(screen.getByLabelText("Description 1")).toHaveValue("Work");
  });
});
