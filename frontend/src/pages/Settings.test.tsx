import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { useAuth } from "../auth";
import { api } from "../lib/api";

vi.mock("../auth", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()), api: vi.fn(), apiBlob: vi.fn(),
}));

const pdf = {
  companyName: "Odan Construction", companyAddress: "Colombo", companyPhone: "0000000000",
  companyEmail: "office@example.test", logoDataUrl: null, documentTitle: "Construction Estimate",
  footerNote: "Thank you", termsConditions: "Standard terms", primaryColor: "#071a2f",
  accentColor: "#d5a94e", fontFamily: "Inter", headerLayout: "LEFT", watermarkEnabled: true,
  watermarkOpacity: 0.045, watermarkSize: "MEDIUM", tableStyle: "NAVY",
};

function renderAt(path: string, role: "ADMIN" | "VIEWER" = "ADMIN") {
  vi.mocked(useAuth).mockReturnValue({
    session: { user: { id: "user-1", name: "Test Administrator", email: "user@example.test", role }, csrfToken: "test" },
    loading: false, error: null, refresh: vi.fn(), signIn: vi.fn(), signOut: vi.fn(),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === "/settings/pdf-template" && !options?.method) return pdf as never;
    if (path === "/settings/pdf-template" && options?.method === "PUT") return JSON.parse(String(options.body)) as never;
    if (path === "/auth/change-password" && options?.method === "POST") return undefined as never;
    throw new Error(`Unexpected request ${path}`);
  });
});

describe("general Settings", () => {
  it("redirects the old password URL and keeps password changes in Account & Security", async () => {
    renderAt("/account/password");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Account & Security" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Test Administrator").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change password" })).not.toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(navigation).toHaveTextContent("Settings");
  });

  it("loads and saves the existing PDF values through the admin-only section", async () => {
    renderAt("/settings/pdf-template");
    expect(await screen.findByRole("tab", { name: "PDF & Documents" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByDisplayValue("Odan Construction")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview PDF template" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Odan Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/settings/pdf-template", expect.objectContaining({ method: "PUT" })));
    const call = vi.mocked(api).mock.calls.find(([path, options]) => path === "/settings/pdf-template" && options?.method === "PUT");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ ...pdf, companyName: "Odan Updated" });
    expect(await screen.findByRole("status")).toHaveTextContent("PDF template settings saved.");
    fireEvent.keyDown(screen.getByRole("tab", { name: "PDF & Documents" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Account & Security" })).toHaveAttribute("aria-selected", "true");
    expect(vi.mocked(api).mock.calls.filter(([path, options]) => path === "/settings/pdf-template" && options?.method === "PUT")).toHaveLength(1);
  });

  it("keeps shared PDF settings unavailable to a viewer and lets mobile navigation open", () => {
    renderAt("/settings?section=pdf", "VIEWER");
    expect(screen.getByRole("tab", { name: "Account & Security" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "PDF & Documents" })).not.toBeInTheDocument();
    expect(api).not.toHaveBeenCalledWith("/settings/pdf-template");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("button", { name: "Close navigation" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
