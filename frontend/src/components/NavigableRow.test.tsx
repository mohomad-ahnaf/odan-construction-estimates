import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { NavigableRow } from "./NavigableRow";

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function view() {
  const onArchive = vi.fn();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Location />
      <table>
        <tbody>
          <NavigableRow to="/clients/client-1" label="Open client Alpha">
            <td>Alpha</td>
            <td>
              <Link to="/clients/client-1">View</Link>
            </td>
            <td>
              <Link to="/clients/client-1/edit">Edit</Link>
            </td>
            <td>
              <button onClick={onArchive}>Archive</button>
            </td>
            <td>
              <select aria-label="Row filter">
                <option>One</option>
              </select>
            </td>
          </NavigableRow>
        </tbody>
      </table>
    </MemoryRouter>,
  );
  return {
    onArchive,
    row: screen.getByRole("row", { name: "Open client Alpha" }),
  };
}

describe("navigable table row", () => {
  it("opens from non-interactive space and keyboard focus", () => {
    const { row } = view();
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.click(screen.getByText("Alpha"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/clients/client-1",
    );
    fireEvent.keyDown(row, { key: "Enter" });
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/clients/client-1",
    );
  });

  it("opens with Space when the row itself has focus", () => {
    const { row } = view();
    row.focus();
    fireEvent.keyDown(row, { key: " " });
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/clients/client-1",
    );
  });

  it("lets links, buttons and selects act independently", () => {
    const { onArchive } = view();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Row filter" }));
    expect(onArchive).toHaveBeenCalledOnce();
    expect(screen.getByTestId("location")).toHaveTextContent("/");
    fireEvent.click(screen.getByRole("link", { name: "Edit" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/clients/client-1/edit",
    );
  });
});
