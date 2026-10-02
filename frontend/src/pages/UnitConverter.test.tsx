import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnitConverter } from "./UnitConverter";
import { readConverterHistory } from "../lib/unitConverterHistory";

const authState = vi.hoisted(() => ({ userId: "user-a" }));
vi.mock("../auth", () => ({
  useAuth: () => ({ session: { user: { id: authState.userId, name: "Test User", role: "ADMIN" } } }),
}));

describe("Unit Converter page", () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); authState.userId = "user-a"; });

  it("converts immediately, swaps using the unrounded value, and resets", () => {
    render(<UnitConverter />);
    fireEvent.change(screen.getByLabelText("From unit"), { target: { value: "ft" } });
    fireEvent.change(screen.getByLabelText("To unit"), { target: { value: "m" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "5.5" } });
    expect(screen.getByLabelText("Converted result").textContent).toContain("1.6764 m");
    fireEvent.click(screen.getByRole("button", { name: "Swap units" }));
    expect(screen.getByLabelText("Converted result").textContent).toContain("5.5000 ft");
    expect(screen.getByText("Equivalent: 5 ft 6 in")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByLabelText("Converted result")).toBeNull();
  });

  it("supports compound feet and inches, precision and inline validation", () => {
    render(<UnitConverter />);
    fireEvent.change(screen.getByLabelText("From unit"), { target: { value: "ft-in" } });
    fireEvent.change(screen.getByLabelText("To unit"), { target: { value: "m" } });
    fireEvent.change(screen.getByLabelText("Feet"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Inches"), { target: { value: "6" } });
    expect(screen.getByLabelText("Converted result").textContent).toContain("1.6764 m");
    fireEvent.change(screen.getByLabelText("Display precision"), { target: { value: "2" } });
    expect(screen.getByLabelText("Converted result").textContent).toContain("1.68 m");
    fireEvent.change(screen.getByLabelText("Inches"), { target: { value: "12" } });
    expect(screen.getByRole("alert").textContent).toContain("below 12");
    expect(screen.queryByLabelText("Converted result")).toBeNull();
  });

  it("swaps a compound result without using its rounded display text", () => {
    render(<UnitConverter />);
    fireEvent.change(screen.getByLabelText("To unit"), { target: { value: "ft-in" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "1.23456789" } });
    expect(screen.getByLabelText("Converted result").textContent).toContain("ft");
    fireEvent.click(screen.getByRole("button", { name: "Swap units" }));
    expect(screen.getByLabelText("Feet")).toBeTruthy();
    expect(screen.getByLabelText("Converted result").textContent).toContain("1.2346 m");
    fireEvent.click(screen.getByRole("button", { name: "Swap units" }));
    expect(screen.getByLabelText("Converted result").textContent).toContain("ft");
  });

  it("shows the trade definition and handles clipboard success and failure", async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("blocked"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<UnitConverter />);
    fireEvent.click(screen.getByRole("tab", { name: "Volume" }));
    expect(screen.getByText("In this converter, 1 cube = 1,000 ft³.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("From unit"), { target: { value: "cube" } });
    fireEvent.change(screen.getByLabelText("To unit"), { target: { value: "m3" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "1" } });
    expect(screen.getByLabelText("Converted result").textContent).toContain("28.3168 m³");
    fireEvent.click(screen.getByRole("button", { name: "Copy result" }));
    await waitFor(() => expect(screen.getByText("Result copied.")).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith("28.3168 m³");
    fireEvent.click(screen.getByRole("button", { name: "Copy result" }));
    await waitFor(() => expect(screen.getByText(/Copy failed/)).toBeTruthy());
  });

  it("saves only on request, restores on refresh, blocks a consecutive duplicate and deletes one entry", () => {
    const view = render(<UnitConverter />);
    expect(screen.getByText("No recent conversions yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save to history" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "10" } });
    expect(readConverterHistory("user-a").entries).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Save to history" }));
    expect(readConverterHistory("user-a").entries).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Save to history" }));
    expect(readConverterHistory("user-a").entries).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to history" }));
    expect(readConverterHistory("user-a").entries.map((item) => item.inputValue)).toEqual([20, 10]);
    view.unmount();
    render(<UnitConverter />);
    expect(screen.getAllByRole("button", { name: /Delete conversion/ })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: /Delete conversion/ })[0]!);
    expect(readConverterHistory("user-a").entries.map((item) => item.inputValue)).toEqual([10]);
    expect(screen.getByLabelText("Value")).toHaveValue("");
  });

  it("clears only after the styled confirmation and keeps users isolated", () => {
    const view = render(<UnitConverter />);
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to history" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    expect(screen.getByRole("alertdialog", { name: "Clear conversion history?" })).toBeTruthy();
    expect(readConverterHistory("user-a").entries).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(readConverterHistory("user-a").entries).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Clear history" })[1]!);
    expect(readConverterHistory("user-a").entries).toHaveLength(0);
    expect(screen.getByText("No recent conversions yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save to history" }));
    view.unmount();
    authState.userId = "user-b";
    render(<UnitConverter />);
    expect(screen.getByText("No recent conversions yet")).toBeTruthy();
    expect(readConverterHistory("user-a").entries).toHaveLength(1);
  });

  it("records compound input and the explicit construction cube label", () => {
    render(<UnitConverter />);
    fireEvent.change(screen.getByLabelText("From unit"), { target: { value: "ft-in" } });
    fireEvent.change(screen.getByLabelText("Feet"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Inches"), { target: { value: "6.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to history" }));
    expect(screen.getByText("5 ft 6.25 in")).toBeTruthy();
    expect(readConverterHistory("user-a").entries[0]?.inputRaw).toEqual({ feet: "5", inches: "6.25" });
    fireEvent.click(screen.getByRole("tab", { name: "Volume" }));
    fireEvent.change(screen.getByLabelText("To unit"), { target: { value: "cube" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "28.316846592" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to history" }));
    expect(screen.getAllByText("1.0000 Construction cube (1,000 ft³)")).toHaveLength(2);
  });

  it("switches browser history with the signed-in user without showing the previous user's rows", () => {
    const view = render(<UnitConverter />);
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to history" }));
    expect(screen.getByText("42 m")).toBeTruthy();
    authState.userId = "user-b";
    view.rerender(<UnitConverter />);
    expect(screen.getByText("No recent conversions yet")).toBeTruthy();
    authState.userId = "user-a";
    view.rerender(<UnitConverter />);
    expect(screen.getByText("42 m")).toBeTruthy();
  });
});
