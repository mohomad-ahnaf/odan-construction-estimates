import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiBlob } from "../lib/api";
import { PlanMeasurementWorkspace } from "./PlanMeasurementWorkspace";

vi.mock("../lib/api", () => ({ api: vi.fn(), apiBlob: vi.fn() }));

const documentRecord = {
  id: "document-1",
  projectId: "project-1",
  fileName: "drawing.png",
  fileType: "image/png",
  version: 1,
  versionGroupId: "group-1",
  isLatest: true,
  status: "DRAFT",
  createdAt: "2026-10-01T00:00:00.000Z",
  uploader: { id: "user-1", name: "Admin", email: "admin@example.test" },
};

const calibration = {
  id: "calibration-1",
  documentId: documentRecord.id,
  pageNumber: 1,
  pageWidth: 100,
  pageHeight: 100,
  referenceGeometry: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  referenceLengthMeters: "10",
  referenceUnit: "m",
  checkReferenceGeometry: null,
  checkReferenceLengthMeters: null,
  metresPerPageUnit: 0.1,
  checkDifferencePercent: null,
  version: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};
const measurementGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  documentId: documentRecord.id,
  name: "Structure",
  version: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  creator: { id: "user-1", name: "Admin" },
  _count: { measurements: 0 },
};

function setupApi(
  onCreate: (body: Record<string, unknown>) => Promise<void>,
  config: {
    groups?: typeof measurementGroup[];
    measurements?: Array<Record<string, unknown>>;
    pageMeasurements?: Array<Record<string, unknown>>;
    onUpdate?: (body: Record<string, unknown>) => Promise<void>;
    onCreateGroup?: (body: Record<string, unknown>) => Promise<typeof measurementGroup>;
    onRenameGroup?: (body: Record<string, unknown>) => Promise<void>;
    onDeleteGroup?: (id: string, body: Record<string, unknown>) => Promise<{ destinationGroupId: string | null; movedCount: number }>;
  } = {},
) {
  vi.mocked(api).mockImplementation(async (path: string, request?: RequestInit) => {
    if (path === "/projects/project-1/plans") return [documentRecord] as never;
    if (path === "/projects/project-1/plans/document-1/pages/1")
      return { document: documentRecord, calibration, measurements: config.pageMeasurements ?? [] } as never;
    if (path === "/projects/project-1/plan-measurements") return (config.measurements ?? []) as never;
    if (path === "/projects/project-1/plans/document-1/measurement-groups" && (!request?.method || request.method === "GET"))
      return (config.groups ?? [measurementGroup]) as never;
    if (path === "/projects/project-1/plans/document-1/measurement-groups" && request?.method === "POST")
      return await config.onCreateGroup?.(JSON.parse(String(request.body)) as Record<string, unknown>) as never;
    if (path.startsWith("/plan-measurement-groups/") && request?.method === "PUT") {
      await config.onRenameGroup?.(JSON.parse(String(request.body)) as Record<string, unknown>);
      return {} as never;
    }
    if (path.startsWith("/plan-measurement-groups/") && request?.method === "DELETE")
      return await config.onDeleteGroup?.(path.split("/").at(-1)!, JSON.parse(String(request.body)) as Record<string, unknown>) as never;
    if (path === "/projects/project-1/plans/document-1/measurements" && request?.method === "POST") {
      await onCreate(JSON.parse(String(request.body)) as Record<string, unknown>);
      return {} as never;
    }
    if (path.startsWith("/plan-measurements/") && request?.method === "PUT") {
      await config.onUpdate?.(JSON.parse(String(request.body)) as Record<string, unknown>);
      return {} as never;
    }
    throw new Error(`Unexpected request ${path}`);
  });
  vi.mocked(apiBlob).mockResolvedValue(new Blob(["image"], { type: "image/png" }));
}

async function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <PlanMeasurementWorkspace projectId="project-1" />
    </QueryClientProvider>,
  );
  const image = await screen.findByAltText("drawing.png");
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Measurement group" })).toHaveValue(measurementGroup.id));
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: 100 });
  Object.defineProperty(image, "naturalHeight", { configurable: true, value: 100 });
  fireEvent.load(image);
  const overlay = result.container.querySelector("svg.plan-overlay")!;
  vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
  });
  return { ...result, overlay };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:plan"),
    revokeObjectURL: vi.fn(),
  });
});

describe("PlanMeasurementWorkspace drafts", () => {
  it("preserves a failed length draft and saves it only after a successful retry", async () => {
    let fail = true;
    const creates: Record<string, unknown>[] = [];
    setupApi(async (body) => {
      creates.push(body);
      if (fail) throw new Error("Measurement could not be saved");
    });
    const { overlay } = await renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Length" }));
    fireEvent.click(overlay, { clientX: 0, clientY: 0 });
    fireEvent.click(overlay, { clientX: 30, clientY: 40 });
    expect(screen.getByText("5.000 m")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Label" }), { target: { value: "Wall line" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to List" }));

    expect(await screen.findByText("Measurement could not be saved")).toBeInTheDocument();
    expect(screen.getByText("5.000 m")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Add to List" }));
    await waitFor(() => expect(screen.queryByLabelText("Unsaved measurement result")).not.toBeInTheDocument());
    expect(creates).toHaveLength(2);
    expect(creates[1]).toMatchObject({ type: "LENGTH", label: "Wall line", groupId: measurementGroup.id });
  });

  it("keeps count points grouped and offers Stay or Discard before changing tools", async () => {
    setupApi(async () => undefined);
    const { overlay } = await renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Count" }));
    fireEvent.click(overlay, { clientX: 10, clientY: 10 });
    fireEvent.click(overlay, { clientX: 20, clientY: 20 });
    fireEvent.click(overlay, { clientX: 30, clientY: 30 });
    expect(screen.getByText("3 count")).toBeInTheDocument();
    expect(screen.getByText("3 points in this group")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Area" }));
    expect(screen.getByRole("dialog", { name: "Unsaved measurement" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.getByText("3 count")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Area" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Unsaved measurement" })).getByRole("button", { name: "Discard" }));
    expect(screen.queryByLabelText("Unsaved measurement result")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Area" })).toHaveAttribute("aria-pressed", "true");
  });

  it("updates a draft immediately when the display unit changes", async () => {
    setupApi(async () => undefined);
    const { overlay } = await renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Length" }));
    fireEvent.click(overlay, { clientX: 0, clientY: 0 });
    fireEvent.click(overlay, { clientX: 30, clientY: 40 });
    fireEvent.change(screen.getByRole("combobox", { name: "Display units" }), { target: { value: "IMPERIAL" } });
    expect(screen.getByText("16.404 ft")).toBeInTheDocument();
    expect(window.localStorage.getItem("odan-plan-display-units")).toBe("IMPERIAL");
  });

  it("shows revision groups with independent totals and moves a saved measurement", async () => {
    const destination = { ...measurementGroup, id: "22222222-2222-4222-8222-222222222222", name: "Finishes" };
    const moved: Record<string, unknown>[] = [];
    const wall = {
      id: "measurement-1",
      documentId: documentRecord.id,
      groupId: measurementGroup.id,
      group: { id: measurementGroup.id, name: measurementGroup.name, documentId: documentRecord.id },
      pageNumber: 2,
      pageWidth: 100,
      pageHeight: 100,
      type: "LENGTH",
      label: "Wall",
      geometry: { points: [{ x: 0, y: 0 }, { x: 30, y: 0 }] },
      quantity: "3.0480000000",
      unit: "m",
      confirmed: false,
      version: 1,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      creator: { id: "user-1", name: "Admin" },
      document: { id: documentRecord.id, version: 1, fileName: documentRecord.fileName, projectId: "project-1" },
    };
    setupApi(async () => undefined, {
      groups: [measurementGroup, destination],
      measurements: [wall],
      onUpdate: async (body) => { moved.push(body); },
    });
    await renderWorkspace();

    fireEvent.change(screen.getByRole("combobox", { name: "Display units" }), { target: { value: "IMPERIAL" } });
    expect(screen.getAllByText("10.000 ft").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Finishes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.000 ft").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole("combobox", { name: "Move Wall to group" }), { target: { value: destination.id } });
    await waitFor(() => expect(moved).toEqual([{ version: 1, groupId: destination.id }]));
  });

  it("shows only the active group's page overlays and can explicitly show all groups", async () => {
    const emptyGroup = { ...measurementGroup, id: "22222222-2222-4222-8222-222222222222", name: "Empty group" };
    const wall = {
      id: "measurement-visible",
      documentId: documentRecord.id,
      groupId: measurementGroup.id,
      group: { id: measurementGroup.id, name: measurementGroup.name, documentId: documentRecord.id },
      pageNumber: 1,
      pageWidth: 100,
      pageHeight: 100,
      type: "LENGTH",
      label: "Visible wall",
      geometry: { points: [{ x: 0, y: 0 }, { x: 30, y: 0 }] },
      quantity: "3.0000000000",
      unit: "m",
      confirmed: false,
      version: 1,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      creator: { id: "user-1", name: "Admin" },
      document: { id: documentRecord.id, version: 1, fileName: documentRecord.fileName, projectId: "project-1" },
    };
    setupApi(async () => undefined, {
      groups: [measurementGroup, emptyGroup],
      measurements: [wall],
      pageMeasurements: [wall],
    });
    const { container } = await renderWorkspace();

    expect(container.querySelector('[data-measurement-id="measurement-visible"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByLabelText("Visible wall measurement"));
    expect(container.querySelector(".plan-saved-row.selected")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Measurement group" }), { target: { value: emptyGroup.id } });
    expect(container.querySelector('[data-measurement-id="measurement-visible"]')).not.toBeInTheDocument();
    expect(container.querySelector(".plan-saved-row.selected")).not.toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("checkbox", { name: "Show all groups" }));
    expect(container.querySelector('[data-measurement-id="measurement-visible"]')).toBeInTheDocument();
  });

  it("keeps the create-group dialog open on validation and API errors, then selects the created group", async () => {
    const created = { ...measurementGroup, id: "33333333-3333-4333-8333-333333333333", name: "Ground floor walls" };
    const currentGroups = [measurementGroup];
    let fail = true;
    setupApi(async () => undefined, {
      groups: currentGroups,
      onCreateGroup: async (body) => {
        if (fail) throw new Error("Group could not be created");
        const next = { ...created, name: String(body.name) };
        currentGroups.push(next);
        return next;
      },
    });
    await renderWorkspace();

    const opener = screen.getByRole("button", { name: "New measurement group" });
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Create measurement group" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/drawing.png · V1/)).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Group name" });
    expect(input).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(screen.getByText("Group name is required.")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "  Ground floor walls  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(await screen.findByText("Group could not be created")).toBeInTheDocument();
    expect(input).toHaveValue("  Ground floor walls  ");

    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create measurement group" })).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Measurement group" })).toHaveValue(created.id);
  });

  it("prefills rename, preserves its value on failure, succeeds on retry, and restores focus after Escape", async () => {
    let fail = true;
    setupApi(async () => undefined, {
      onRenameGroup: async () => {
        if (fail) throw new Error("Rename failed");
      },
    });
    await renderWorkspace();

    const renameButton = screen.getByRole("button", { name: "Rename selected group" });
    renameButton.focus();
    fireEvent.click(renameButton);
    const input = screen.getByRole("textbox", { name: "Group name" });
    expect(input).toHaveValue("Structure");
    fireEvent.change(input, { target: { value: "Finishes" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename group" }));
    expect(await screen.findByText("Rename failed")).toBeInTheDocument();
    expect(input).toHaveValue("Finishes");

    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Rename group" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename measurement group" })).not.toBeInTheDocument());

    renameButton.focus();
    fireEvent.click(renameButton);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Rename measurement group" })).not.toBeInTheDocument();
    expect(renameButton).toHaveFocus();
  });

  it("deletes an empty group from its header without toggling the card", async () => {
    const groupList = [measurementGroup, { ...measurementGroup, id: "22222222-2222-4222-8222-222222222222", name: "Finishes" }];
    const deletes: Record<string, unknown>[] = [];
    setupApi(async () => undefined, {
      groups: groupList,
      onDeleteGroup: async (id, body) => {
        deletes.push({ id, ...body });
        groupList.splice(groupList.findIndex((group) => group.id === id), 1);
        return { destinationGroupId: null, movedCount: 0 };
      },
    });
    const { container } = await renderWorkspace();
    const cards = container.querySelectorAll(".plan-measurement-group");
    expect(cards[0]).toHaveAttribute("open");
    fireEvent.click(within(cards[0] as HTMLElement).getByRole("button", { name: "Delete group" }));
    expect(cards[0]).toHaveAttribute("open");
    const dialog = screen.getByRole("alertdialog", { name: "Delete measurement group?" });
    expect(within(dialog).getByText(/Structure/)).toBeInTheDocument();
    expect(deletes).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete group$/ }));
    await waitFor(() => expect(deletes).toEqual([{ id: measurementGroup.id, version: 1 }]));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Measurement group" })).toHaveValue(groupList[0]!.id));
    expect(screen.queryByText("Structure")).not.toBeInTheDocument();
  });

  it("offers a same-revision destination for a populated group and retains the dialog after an API failure", async () => {
    const destination = { ...measurementGroup, id: "22222222-2222-4222-8222-222222222222", name: "Finishes" };
    const source = { ...measurementGroup, _count: { measurements: 2 } };
    const groupList = [source, destination];
    const attempts: Record<string, unknown>[] = [];
    let fail = true;
    setupApi(async () => undefined, {
      groups: groupList,
      onDeleteGroup: async (_, body) => {
        attempts.push(body);
        if (fail) throw new Error("Move failed");
        groupList.shift();
        return { destinationGroupId: destination.id, movedCount: 2 };
      },
    });
    const { container } = await renderWorkspace();
    fireEvent.click(within(container.querySelector(".plan-measurement-group") as HTMLElement).getByRole("button", { name: "Delete group" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete measurement group?" });
    expect(within(dialog).getByRole("combobox", { name: "Move measurements to" })).toHaveValue(destination.id);
    const submit = within(dialog).getByRole("button", { name: "Move measurements and delete group" });
    fireEvent.click(submit);
    expect(await within(dialog).findByText("Move failed")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog", { name: "Delete measurement group?" })).toBeInTheDocument();
    fail = false;
    fireEvent.click(submit);
    await waitFor(() => expect(attempts).toEqual([
      { version: 1, destinationGroupId: destination.id },
      { version: 1, destinationGroupId: destination.id },
    ]));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Measurement group" })).toHaveValue(destination.id));
  });

  it("shows the New group action after deleting the last empty group", async () => {
    const groupList: typeof measurementGroup[] = [measurementGroup];
    setupApi(async () => undefined, {
      groups: groupList,
      onDeleteGroup: async () => {
        groupList.splice(0);
        return { destinationGroupId: null, movedCount: 0 };
      },
    });
    const { container } = await renderWorkspace();
    fireEvent.click(within(container.querySelector(".plan-measurement-group") as HTMLElement).getByRole("button", { name: "Delete group" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Delete measurement group?" })).getByRole("button", { name: /^Delete group$/ }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Measurement group" })).toHaveValue(""));
    expect(screen.getAllByText("No group selected").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "New measurement group" })).toBeEnabled();
  });

  it("can create a destination when the populated group is the only group", async () => {
    const source = { ...measurementGroup, _count: { measurements: 1 } };
    const destination = { ...measurementGroup, id: "33333333-3333-4333-8333-333333333333", name: "New takeoff" };
    const groupList = [source];
    const deletes: Record<string, unknown>[] = [];
    setupApi(async () => undefined, {
      groups: groupList,
      onDeleteGroup: async (_, body) => {
        deletes.push(body);
        groupList.splice(0, 1, destination);
        return { destinationGroupId: destination.id, movedCount: 1 };
      },
    });
    const { container } = await renderWorkspace();
    fireEvent.click(within(container.querySelector(".plan-measurement-group") as HTMLElement).getByRole("button", { name: "Delete group" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete measurement group?" });
    expect(within(dialog).getByRole("combobox", { name: "Move measurements to" })).toHaveValue("NEW");
    fireEvent.click(within(dialog).getByRole("button", { name: "Move measurements and delete group" }));
    expect(within(dialog).getByText("Enter a destination group name of 1–100 characters.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "New destination group name" }), { target: { value: " New takeoff " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move measurements and delete group" }));
    await waitFor(() => expect(deletes).toEqual([{ version: 1, newGroupName: "New takeoff" }]));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Measurement group" })).toHaveValue(destination.id));
  });

  it("keeps an unsaved draft when group deletion is cancelled", async () => {
    setupApi(async () => undefined);
    const { overlay, container } = await renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Length" }));
    fireEvent.click(overlay, { clientX: 0, clientY: 0 });
    fireEvent.click(overlay, { clientX: 30, clientY: 40 });
    fireEvent.click(within(container.querySelector(".plan-measurement-group") as HTMLElement).getByRole("button", { name: "Delete group" }));
    const guard = screen.getByRole("dialog", { name: "Unsaved measurement" });
    expect(screen.queryByRole("alertdialog", { name: "Delete measurement group?" })).not.toBeInTheDocument();
    fireEvent.click(within(guard).getByRole("button", { name: "Stay" }));
    expect(screen.getByLabelText("Unsaved measurement result")).toBeInTheDocument();
    expect(screen.getByText("5.000 m")).toBeInTheDocument();
  });
});
