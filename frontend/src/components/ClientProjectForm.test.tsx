import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClientForm } from "./ClientForm";
import { ProjectForm } from "./ProjectForm";
describe("Client and Project forms", () => {
  it("rejects a missing client name and an invalid email", async () => {
    const save = vi.fn();
    render(<ClientForm onSave={save} />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save client" }));
    expect(
      await screen.findByText("Client name is required"),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("submits client contact information", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ClientForm onSave={save} />);
    fireEvent.change(screen.getByLabelText("Client name"), {
      target: { value: "Client A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save client" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].name).toBe("Client A");
  });
  it("locks the project owner and validates project name", async () => {
    const save = vi.fn();
    render(<ProjectForm clientName="Client A" onSave={save} />);
    expect(screen.getByText(/Client A/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));
    expect(
      await screen.findByText("Project name is required"),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("submits a Project for the locked Client", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ProjectForm clientName="Client A" onSave={save} />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Residence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].projectName).toBe("Residence");
    expect(save.mock.calls[0][0]).not.toHaveProperty("clientId");
  });
});
