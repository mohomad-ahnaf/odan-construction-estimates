import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { Layout } from "./Layout";

vi.mock("../auth", () => ({
  useAuth: () => ({ session: { user: { id: "user", name: "Odan Admin", role: "ADMIN" } }, signOut: vi.fn() }),
}));

afterEach(() => { document.body.style.overflow = ""; });

it("opens the mobile drawer, traps focus, dismisses it, and restores page scrolling", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const router = createMemoryRouter([{ element: <Layout />, children: [
    { path: "/", element: <p>Home page</p> },
    { path: "/projects", element: <p>Projects page</p> },
  ] }], { initialEntries: ["/"] });
  render(<RouterProvider router={router} />);
  const menu = screen.getByRole("button", { name: "Open navigation" });
  fireEvent.click(menu);
  expect(menu).toHaveAttribute("aria-expanded", "true");
  expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(document.body.style.overflow).toBe("");
  expect(menu).toHaveFocus();
  fireEvent.click(menu);
  fireEvent.click(screen.getByRole("link", { name: /Projects/ }));
  expect(await screen.findByText("Projects page")).toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
  expect(menu).toHaveAttribute("aria-expanded", "false");
});
