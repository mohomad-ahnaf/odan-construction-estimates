import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Layout } from "../components/Layout";
import { UnitConverter } from "./UnitConverter";

vi.mock("../auth", () => ({
  useAuth: () => ({ session: { user: { id: "viewer-user", name: "Test User", role: "VIEWER" } }, signOut: vi.fn() }),
}));

describe("Unit Converter navigation", () => {
  it("appears below Estimates and opens in the existing workspace layout", () => {
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
    render(
      <MemoryRouter initialEntries={["/unit-converter"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/unit-converter" element={<UnitConverter />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(navigation.textContent?.indexOf("Estimates")).toBeLessThan(navigation.textContent?.indexOf("Unit Converter") ?? 0);
    expect(screen.getByRole("link", { name: "Unit Converter" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { name: "Unit Converter" })).toBeTruthy();
  });
});
