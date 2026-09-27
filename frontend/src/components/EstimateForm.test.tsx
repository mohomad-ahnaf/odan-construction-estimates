import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EstimateForm } from "./EstimateForm";
describe("estimate editor", () => {
  it("prevents empty estimates from being saved", async () => {
    const save = vi.fn();
    render(<EstimateForm onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Save estimate →" }));
    await screen.findByText("Project title is required");
    expect(save).not.toHaveBeenCalled();
  });
  it("submits numeric quantities and rates and supports extra items", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<EstimateForm onSave={save} />);
    fireEvent.change(screen.getByLabelText("Project title"), {
      target: { value: "New residence" },
    });
    fireEvent.change(screen.getByLabelText("Client name"), {
      target: { value: "Client" },
    });
    fireEvent.change(screen.getByLabelText("Description 1"), {
      target: { value: "Excavation" },
    });
    fireEvent.change(screen.getByLabelText("Quantity 1"), {
      target: { value: "2.5" },
    });
    fireEvent.change(screen.getByLabelText("Rate 1"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "＋ Add line item" }));
    expect(screen.getByLabelText("Description 2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Remove item 2"));
    fireEvent.click(screen.getByRole("button", { name: "Save estimate →" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].items).toEqual([
      { description: "Excavation", unit: "m²", quantity: 2.5, rate: 100 },
    ]);
  });
  it("preserves the form and explains a failed save", async () => {
    render(
      <EstimateForm
        initial={{
          title: "Residence",
          clientName: "Client",
          clientEmail: "",
          siteAddress: "",
          currency: "LKR",
          taxPercent: 0,
          notes: "",
          items: [{ description: "Work", unit: "m²", quantity: 1, rate: 20 }],
        }}
        onSave={async () => {
          throw new Error("Estimate changed. Reload before editing.");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save estimate →" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Estimate changed",
    );
    expect(screen.getByLabelText("Project title")).toHaveValue("Residence");
  });
});
