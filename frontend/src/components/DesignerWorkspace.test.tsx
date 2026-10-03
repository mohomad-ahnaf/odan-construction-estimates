import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { DesignerWorkspace } from "./DesignerWorkspace";
import { api } from "../lib/api";
import type { DesignerModel } from "../types";
import type { EndIntents } from "../lib/designerConnections";

vi.mock("../lib/api", () => ({ api: vi.fn() }));
vi.mock("./Designer3D", () => ({ Designer3D: () => <div>3D scene</div> }));
vi.mock("./DesignerTopCanvas", () => ({ DesignerTopCanvas: ({ walls, onDraw, onPickWall }: {
  walls: DesignerModel["walls"]; onDraw: (a: { x: number; y: number }, b: { x: number; y: number }, intents: EndIntents) => void;
  onPickWall: (id: string, point: { x: number; y: number }) => void;
}) => <div><button onClick={() => onDraw({ x: 0, y: 0 }, { x: 6, y: 0 }, { START: null, END: null })}>Draw test wall</button>
  {walls[0] && <button onClick={() => onDraw({ x: 3, y: 0 }, { x: 3, y: 4 }, {
    START: { point: { x: 3, y: 0 }, candidates: [{ wallId: walls[0]!.id, point: { x: 3, y: 0 }, kind: "T", distancePx: 2 }],
      chosenWallId: walls[0]!.id }, END: null })}>Draw joined wall</button>}
  {walls[0] && <button onClick={() => onPickWall(walls[0]!.id, { x: 2, y: 0 })}>Pick test wall</button>}</div> }));
let stored: DesignerModel | null = null;
beforeEach(() => {
  stored = null;
  vi.mocked(api).mockReset().mockImplementation(async (_path: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      stored = { id: "model", projectId: "project", name: "Ground floor", floorHeightMeters: 3,
        version: 1, status: "DRAFT", walls: [], junctions: [], quantities: {} as DesignerModel["quantities"] };
      return structuredClone(stored) as never;
    }
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      stored = { ...stored!, ...body, version: stored!.version + 1 };
      return structuredClone(stored) as never;
    }
    return structuredClone(stored) as never;
  });
});
it("joins on an intentional snap, disconnects, and restores the geometry and join with undo", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/", element: <DesignerWorkspace projectId="project" /> }], { initialEntries: ["/"] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Create 3D model" }));
  fireEvent.click(await screen.findByRole("button", { name: /Wall$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Draw test wall" }));
  fireEvent.click(screen.getByRole("button", { name: "Add wall" }));
  fireEvent.click(screen.getByRole("button", { name: "Draw joined wall" }));
  expect(screen.getByText(/Join to Wall 1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add wall" }));
  expect(screen.getByText(/Connected to Wall 1/)).toBeInTheDocument();
  expect(screen.getByText(/^Junctions\s*$/)).toHaveTextContent("0.30");
  fireEvent.click(screen.getByRole("button", { name: /Disconnect Wall 2/ }));
  expect(screen.getByText(/^Junctions\s*$/)).toHaveTextContent("0.00");
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByText(/Connected to Wall 1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.queryByText(/Connected to Wall 1/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(stored?.junctions).toHaveLength(1));
});
it("opens a saved model without changing its walls or connections", async () => {
  const base = { heightMeters: 3, thicknessMeters: .2, alignment: "CENTRELINE" as const,
    faces: ["A", "B"].map((side) => ({ side, roomName: null, plaster: false,
      plasterHeightMeters: 3, paint: false, paintHeightMeters: 3 })) as DesignerModel["walls"][number]["faces"], openings: [] };
  const first = { ...base, id: "existing-a", label: "Existing A", startX: 0, startY: 0, endX: 6, endY: 0 };
  const second = { ...base, id: "existing-b", label: "Existing B", startX: 3, startY: 0, endX: 3, endY: 4 };
  stored = { id: "model", projectId: "project", name: "Ground floor", floorHeightMeters: 3,
    version: 7, status: "REVIEWED", walls: [first, second], junctions: [{ id: "existing-j",
      continuousWallId: first.id, adjoiningWallId: second.id, adjoiningEnd: "START" }],
    quantities: {} as DesignerModel["quantities"] };
  const before = structuredClone(stored);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/", element: <DesignerWorkspace projectId="project" /> }], { initialEntries: ["/"] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  await screen.findByText(/Walls \/ doors \/ windows/);
  expect(screen.getByText(/^Junctions\s*$/)).toHaveTextContent("0.30");
  expect(vi.mocked(api).mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
  expect(stored).toEqual(before);
});
it("creates a standalone wall and door, supports undo/redo, saves, and reloads", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/", element: <DesignerWorkspace projectId="project" /> }], { initialEntries: ["/"] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Create 3D model" }));
  fireEvent.click(await screen.findByRole("button", { name: /Wall$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Draw test wall" }));
  expect(await screen.findByRole("dialog", { name: "Create wall" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add wall" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create wall" })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Door$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Pick test wall" }));
  expect(screen.getByRole("dialog", { name: "Place door" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add opening" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Place door" })).not.toBeInTheDocument());
  expect(screen.getByText(/Walls \/ doors \/ windows/).parentElement).toHaveTextContent("1 / 1 / 0");
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByText(/Walls \/ doors \/ windows/).parentElement).toHaveTextContent("1 / 0 / 0");
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(stored?.walls[0]?.openings).toHaveLength(1));
  expect(stored?.walls[0]?.endX).toBe(6);
});
