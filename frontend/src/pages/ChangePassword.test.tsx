import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChangePassword } from "./ChangePassword";
import { api, ApiError } from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()), api: vi.fn(),
}));
const current = "c".repeat(20);
const next = "n".repeat(20);

function fill(newPassword = next, confirmPassword = next) {
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: current },
  });
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirmPassword },
  });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
}

beforeEach(() => vi.clearAllMocks());

describe("change password form", () => {
  it("submits valid input and clears all password fields after success", async () => {
    vi.mocked(api).mockResolvedValue(undefined);
    render(<ChangePassword />);
    fill();
    await screen.findByRole("status");
    expect(api).toHaveBeenCalledWith("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
  });

  it("shows a failed change without clearing the entered fields", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(401, "Invalid credentials"));
    render(<ChangePassword />);
    fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The current password could not be verified.",
    );
    expect(screen.getByLabelText("Current password")).toHaveValue(current);
    expect(screen.getByLabelText("New password")).toHaveValue(next);
  });

  it("blocks weak, reused, and mismatched passwords locally", async () => {
    render(<ChangePassword />);
    fill("short", "short");
    expect(
      await screen.findByText("Use at least 16 characters"),
    ).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^New password/), {
      target: { value: current },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: current },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(
      await screen.findByText("Choose a different password"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^New password/), {
      target: { value: next },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() =>
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument(),
    );
    expect(api).not.toHaveBeenCalled();
  });

  it("uses password autocomplete and accessible visibility controls", () => {
    render(<ChangePassword embedded />);
    const currentInput = screen.getByLabelText("Current password");
    const newInput = screen.getByLabelText("New password");
    expect(currentInput).toHaveAttribute("autocomplete", "current-password");
    expect(newInput).toHaveAttribute("autocomplete", "new-password");
    expect(currentInput).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show current password" }));
    expect(currentInput).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Hide current password" }));
    expect(currentInput).toHaveAttribute("type", "password");
  });
});
