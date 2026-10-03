import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { api, apiBlob } from "../lib/api";
import { clientToRotatedPagePoint, fitPlanScale, planCanvasRenderMetrics } from "../lib/planGeometry";
import {
  draftQuantityInMetric,
  formatPlanQuantity,
  measurementDraftComplete,
  measurementTotals,
  type DisplayUnitSystem,
  type MeasurementKind,
} from "../lib/planMeasurementDisplay";
import type {
  PageCalibration,
  PlanDocument,
  PlanMeasurement,
  PlanMeasurementGroup,
  PlanPageWorkspace,
  PlanPoint,
} from "../types";

type Tool = "SELECT" | "PAN" | "SCALE" | "CHECK" | "LENGTH" | "AREA" | "COUNT";
type Size = { width: number; height: number };
type Rotation = 0 | 90 | 180 | 270;
type PendingWorkspaceChange =
  | { kind: "tool"; value: Tool }
  | { kind: "document"; value: string }
  | { kind: "page"; value: number }
  | { kind: "deleteGroup"; value: string };
type WorkspaceDialog =
  | { kind: "CREATE_GROUP" }
  | { kind: "RENAME_GROUP"; group: PlanMeasurementGroup }
  | { kind: "DELETE_GROUP"; group: PlanMeasurementGroup }
  | { kind: "EDIT_MEASUREMENT"; measurement: PlanMeasurement }
  | { kind: "DELETE_MEASUREMENT"; measurement: PlanMeasurement };

const previewTypes = ["application/pdf", "image/png", "image/jpeg"];
const PDF_ZOOM_RENDER_DELAY_MS = 140;
const DISPLAY_UNITS_KEY = "odan-plan-display-units";
const GROUP_COLORS = ["#b7791f", "#2563a8", "#17735a", "#9b3f55", "#6d4eb4", "#b45309", "#24748a", "#7b5d2a"];
const toolDetails: Record<Tool, { label: string; icon: string; hint: string }> = {
  PAN: { label: "Pan", icon: "✥", hint: "Drag the plan to pan" },
  SELECT: { label: "Select", icon: "↖", hint: "Review saved measurements" },
  SCALE: { label: "Set Scale", icon: "↔", hint: "Set the drawing scale" },
  CHECK: { label: "Check Scale", icon: "✓", hint: "Check the saved scale" },
  LENGTH: { label: "Length", icon: "╱", hint: "Measure between two points" },
  AREA: { label: "Area", icon: "▱", hint: "Measure a polygon area" },
  COUNT: { label: "Count", icon: "#", hint: "Place a named group of count markers" },
};

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function quantityLabel(measurement: PlanMeasurement, displayUnits: DisplayUnitSystem) {
  return formatPlanQuantity(measurement.type, Number(measurement.quantity), displayUnits);
}

export function measurementGroupColor(id: string) {
  let hash = 0;
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length]!;
}

function MeasurementDialog({
  title,
  labelledBy,
  onClose,
  children,
  initialFocusRef,
  role = "dialog",
}: {
  title: string;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  role?: "dialog" | "alertdialog";
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    (initialFocusRef?.current ?? focusable()[0])?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      opener?.focus();
    };
  }, [initialFocusRef]);

  return (
    <div className="modal-backdrop plan-dialog-backdrop" role="presentation">
      <section ref={dialogRef} className="modal-card modal-card-small plan-management-dialog" role={role} aria-modal="true" aria-labelledby={labelledBy}>
        <div className="modal-heading">
          <h2 id={labelledBy}>{title}</h2>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function PlanOverlay({
  width,
  height,
  measurements,
  calibration,
  draft,
  tool,
  rotation,
  svgRef,
  onPoint,
  onPanStart,
  onPanMove,
  onPanEnd,
  onGesture,
  selectedMeasurementId,
  onSelectMeasurement,
}: {
  width: number;
  height: number;
  measurements: PlanMeasurement[];
  calibration: PageCalibration | null;
  draft: PlanPoint[];
  tool: Tool;
  rotation: Rotation;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onPoint: (point: PlanPoint) => void;
  onPanStart: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPanMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPanEnd: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onGesture: (scale: number, deltaX: number, deltaY: number) => void;
  selectedMeasurementId: string | null;
  onSelectMeasurement: (id: string | null) => void;
}) {
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  return (
    <svg
      ref={svgRef}
      className={`plan-overlay plan-tool-${tool.toLowerCase()}`}
      viewBox={`0 0 ${width} ${height}`}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") {
          if (!touches.current.size) suppressClickUntil.current = 0;
          touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          touchStart.current = { x: event.clientX, y: event.clientY };
          if (touches.current.size > 1) {
            onPanEnd(event);
            suppressClickUntil.current = Date.now() + 500;
            const [a, b] = [...touches.current.values()];
            gesture.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
            return;
          }
        }
        onPanStart(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" && touches.current.has(event.pointerId)) {
          touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (touches.current.size > 1) {
            const [a, b] = [...touches.current.values()];
            const next = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
            if (gesture.current && next.distance > 0) onGesture(next.distance / gesture.current.distance, next.x - gesture.current.x, next.y - gesture.current.y);
            gesture.current = next;
            suppressClickUntil.current = Date.now() + 500;
            return;
          }
          if (touchStart.current && Math.hypot(event.clientX - touchStart.current.x, event.clientY - touchStart.current.y) > 8)
            suppressClickUntil.current = Date.now() + 500;
          if (gesture.current) return;
        }
        onPanMove(event);
      }}
      onPointerUp={(event) => {
        touches.current.delete(event.pointerId);
        if (!touches.current.size) gesture.current = null;
        onPanEnd(event);
      }}
      onPointerCancel={(event) => {
        touches.current.delete(event.pointerId);
        suppressClickUntil.current = Date.now() + 500;
        if (!touches.current.size) gesture.current = null;
        onPanEnd(event);
      }}
      onClick={(event) => {
        if (Date.now() < suppressClickUntil.current) return;
        if (tool === "PAN") return;
        if (tool === "SELECT") {
          onSelectMeasurement(null);
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        onPoint(clientToRotatedPagePoint(event.clientX, event.clientY, rect, width, height, rotation));
      }}
    >
      {calibration && (
        <line
          className="plan-calibration-line"
          x1={calibration.referenceGeometry.points[0].x}
          y1={calibration.referenceGeometry.points[0].y}
          x2={calibration.referenceGeometry.points[1].x}
          y2={calibration.referenceGeometry.points[1].y}
        />
      )}
      {measurements.map((measurement) => {
        const points = measurement.geometry.points;
        const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
        const color = measurementGroupColor(measurement.groupId);
        const selected = selectedMeasurementId === measurement.id;
        const selectMeasurement = (event: { stopPropagation(): void }) => {
          if (Date.now() < suppressClickUntil.current) return;
          if (tool !== "SELECT") return;
          event.stopPropagation();
          onSelectMeasurement(measurement.id);
        };
        if (measurement.type === "COUNT")
          return (
            <g key={measurement.id} data-measurement-id={measurement.id} data-group-id={measurement.groupId} aria-label={`${measurement.label} measurement`} role="button" onClick={selectMeasurement}>
              {points.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r={Math.max(width, height) * (selected ? 0.009 : 0.006)} fill={color} stroke={selected ? "#071a2f" : "#fff"} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          );
        return measurement.type === "AREA" ? (
          <polygon key={measurement.id} data-measurement-id={measurement.id} data-group-id={measurement.groupId} aria-label={`${measurement.label} measurement`} role="button" points={pointString} fill={`${color}22`} stroke={color} strokeWidth={selected ? 4 : 2} vectorEffect="non-scaling-stroke" onClick={selectMeasurement} />
        ) : (
          <polyline key={measurement.id} data-measurement-id={measurement.id} data-group-id={measurement.groupId} aria-label={`${measurement.label} measurement`} role="button" points={pointString} fill="none" stroke={color} strokeWidth={selected ? 4 : 2} vectorEffect="non-scaling-stroke" onClick={selectMeasurement} />
        );
      })}
      {draft.length > 0 && (
        <g className="plan-draft-overlay">
          {tool === "AREA" && draft.length > 1 && (
            draft.length >= 3
              ? <polygon points={draft.map((point) => `${point.x},${point.y}`).join(" ")} className="plan-draft-area" vectorEffect="non-scaling-stroke" />
              : <polyline points={draft.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" className="plan-draft-line" vectorEffect="non-scaling-stroke" />
          )}
          {(tool === "LENGTH" || tool === "SCALE" || tool === "CHECK") && draft.length > 1 && (
            <line x1={draft[0]!.x} y1={draft[0]!.y} x2={draft[1]!.x} y2={draft[1]!.y} className="plan-draft-line" vectorEffect="non-scaling-stroke" />
          )}
          {draft.map((point, index) => (
            <circle key={index} cx={point.x} cy={point.y} r={Math.max(width, height) * 0.005} className="plan-draft-point" />
          ))}
        </g>
      )}
    </svg>
  );
}

export function PlanMeasurementWorkspace({ projectId }: { projectId: string }) {
  const cache = useQueryClient();
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const measurementSaveInFlight = useRef(false);
  const [selectedId, setSelectedId] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageSize, setPageSize] = useState<Size>({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState<Size>({ width: 900, height: 620 });
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [zoom, setZoom] = useState(1);
  const renderedZoom = useDebouncedValue(zoom, PDF_ZOOM_RENDER_DELAY_MS);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<Rotation>(0);
  const [tool, setTool] = useState<Tool>("PAN");
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [draft, setDraft] = useState<PlanPoint[]>([]);
  const [draftLabel, setDraftLabel] = useState("");
  const [unit, setUnit] = useState<"mm" | "cm" | "m" | "ft" | "in">("m");
  const [lengthValue, setLengthValue] = useState("1");
  const [feet, setFeet] = useState("0");
  const [inches, setInches] = useState("0");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [displayUnits, setDisplayUnits] = useState<DisplayUnitSystem>(() => {
    try {
      return window.localStorage.getItem(DISPLAY_UNITS_KEY) === "IMPERIAL" ? "IMPERIAL" : "METRIC";
    } catch {
      return "METRIC";
    }
  });
  const [pendingChange, setPendingChange] = useState<PendingWorkspaceChange | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [draftGroupId, setDraftGroupId] = useState<string | null>(null);
  const [groupError, setGroupError] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(() => new Set());
  const [workspaceDialog, setWorkspaceDialog] = useState<WorkspaceDialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [deleteDestination, setDeleteDestination] = useState("");
  const [deleteNewGroupName, setDeleteNewGroupName] = useState("");
  const deleteInFlight = useRef(false);
  const dialogInputRef = useRef<HTMLInputElement>(null);

  const plans = useQuery({
    queryKey: ["project-plans", projectId],
    queryFn: () => api<PlanDocument[]>(`/projects/${projectId}/plans`),
  });
  const selected = plans.data?.find((document) => document.id === selectedId) ?? null;
  const page = useQuery({
    queryKey: ["plan-page", projectId, selectedId, pageNumber],
    queryFn: () => api<PlanPageWorkspace>(`/projects/${projectId}/plans/${selectedId}/pages/${pageNumber}`),
    enabled: Boolean(selectedId),
  });
  const summary = useQuery({
    queryKey: ["plan-measurements", projectId],
    queryFn: () => api<PlanMeasurement[]>(`/projects/${projectId}/plan-measurements`),
  });
  const groups = useQuery({
    queryKey: ["plan-measurement-groups", projectId, selectedId],
    queryFn: () => api<PlanMeasurementGroup[]>(`/projects/${projectId}/plans/${selectedId}/measurement-groups`),
    enabled: Boolean(selectedId),
  });
  const draftMeasurementType: MeasurementKind | null = tool === "LENGTH" || tool === "AREA" || tool === "COUNT" ? tool : null;
  const completedMeasurementDraft = draftMeasurementType
    ? measurementDraftComplete(draftMeasurementType, draft)
    : false;
  const draftMetricQuantity = draftMeasurementType
    ? draftQuantityInMetric(draftMeasurementType, draft, page.data?.calibration?.metresPerPageUnit ?? null)
    : null;
  const draftGroup = groups.data?.find((group) => group.id === draftGroupId) ?? null;
  const selectedGroup = groups.data?.find((group) => group.id === selectedGroupId) ?? null;
  const groupColors = useMemo(
    () => new Map((groups.data ?? []).map((group) => [group.id, measurementGroupColor(group.id)])),
    [groups.data],
  );

  useEffect(() => {
    if (!groups.data) return;
    if (!groups.data.some((group) => group.id === selectedGroupId))
      setSelectedGroupId(groups.data[0]?.id ?? "");
  }, [groups.data, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) return;
    setOpenGroupIds((current) => {
      if (current.has(selectedGroupId)) return current;
      const next = new Set(current);
      next.add(selectedGroupId);
      return next;
    });
  }, [selectedGroupId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DISPLAY_UNITS_KEY, displayUnits);
    } catch {
      // The selector still works when storage is disabled.
    }
  }, [displayUnits]);

  useEffect(() => {
    if (!completedMeasurementDraft) return;
    const protectDraft = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [completedMeasurementDraft]);

  useEffect(() => {
    if (!selectedId && plans.data?.length) setSelectedId(plans.data[0]!.id);
  }, [plans.data, selectedId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () => setContainerSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selected) return;
    let disposed = false;
    let objectUrl = "";
    let loadedPdf: PDFDocumentProxy | null = null;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    setFileLoading(true);
    setFileError("");
    setPdf(null);
    setImageUrl("");
    setPageNumber(1);
    setPageCount(1);
    setPageSize({ width: 0, height: 0 });
    setDraft([]);
    setDraftGroupId(null);
    setSelectedGroupId("");
    setSelectedMeasurementId(null);
    setShowAllGroups(false);
    setOpenGroupIds(new Set());
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    void apiBlob(`/documents/${selected.id}/content`)
      .then(async (blob) => {
        if (selected.fileType === "application/pdf") {
          const pdfjs = await import("pdfjs-dist");
          const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
          pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
          const task = pdfjs.getDocument({ data: await blob.arrayBuffer() });
          loadingTask = task;
          loadedPdf = await task.promise;
          if (disposed) {
            await task.destroy();
            return;
          }
          setPdf(loadedPdf);
          setPageCount(loadedPdf.numPages);
        } else {
          objectUrl = URL.createObjectURL(blob);
          if (!disposed) setImageUrl(objectUrl);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) setFileError(error instanceof Error ? error.message : "Plan could not be loaded");
      })
      .finally(() => {
        if (!disposed) setFileLoading(false);
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (loadingTask) void loadingTask.destroy();
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let disposed = false;
    let task: RenderTask | null = null;
    let cleanup: (() => void) | undefined;
    void pdf.getPage(pageNumber).then((pdfPage) => {
      if (disposed) return;
      const original = pdfPage.getViewport({ scale: 1, rotation: 0 });
      const quarterTurn = rotation === 90 || rotation === 270;
      const scale = fitPlanScale(
        containerSize.width,
        containerSize.height,
        quarterTurn ? original.height : original.width,
        quarterTurn ? original.width : original.height,
      );
      const displayScale = scale * renderedZoom;
      const viewport = pdfPage.getViewport({ scale: displayScale, rotation: 0 });
      const renderMetrics = planCanvasRenderMetrics(
        viewport.width,
        viewport.height,
        window.devicePixelRatio || 1,
      );
      const canvas = canvasRef.current!;
      canvas.width = renderMetrics.pixelWidth;
      canvas.height = renderMetrics.pixelHeight;
      setPageSize({ width: original.width, height: original.height });
      task = pdfPage.render({
        canvas,
        canvasContext: canvas.getContext("2d")!,
        viewport,
        transform: [
          renderMetrics.pixelWidth / viewport.width,
          0,
          0,
          renderMetrics.pixelHeight / viewport.height,
          0,
          0,
        ],
      });
      cleanup = () => pdfPage.cleanup();
      return task.promise;
    }).catch((error: unknown) => {
      if (!disposed && (error as { name?: string }).name !== "RenderingCancelledException")
        setFileError(error instanceof Error ? error.message : "PDF page could not be rendered");
    });
    return () => {
      disposed = true;
      task?.cancel();
      cleanup?.();
    };
  }, [pdf, pageNumber, containerSize, rotation, renderedZoom]);

  const quarterTurn = rotation === 90 || rotation === 270;
  const baseScale = pageSize.width && pageSize.height
    ? fitPlanScale(
        containerSize.width,
        containerSize.height,
        quarterTurn ? pageSize.height : pageSize.width,
        quarterTurn ? pageSize.width : pageSize.height,
      )
    : 1;
  const surfaceWidth = pageSize.width * baseScale * zoom;
  const surfaceHeight = pageSize.height * baseScale * zoom;
  const stageWidth = quarterTurn ? surfaceHeight : surfaceWidth;
  const stageHeight = quarterTurn ? surfaceWidth : surfaceHeight;
  const rotationTransform = rotation === 90
    ? `translate(${surfaceHeight}px, 0) rotate(90deg)`
    : rotation === 180
      ? `translate(${surfaceWidth}px, ${surfaceHeight}px) rotate(180deg)`
      : rotation === 270
        ? `translate(0, ${surfaceWidth}px) rotate(270deg)`
        : "none";

  function rotateView(step: -90 | 90) {
    setRotation((current) => ((current + step + 360) % 360) as Rotation);
    setPan({ x: 0, y: 0 });
  }

  function discardMeasurementDraft() {
    setDraft([]);
    setDraftGroupId(null);
    setDraftLabel("");
    setActionError("");
  }

  function applyWorkspaceChange(change: PendingWorkspaceChange) {
    discardMeasurementDraft();
    if (change.kind === "tool") {
      setTool(change.value);
      setDraftLabel(change.value === "COUNT" ? "Items" : "");
    } else if (change.kind === "document") {
      setSelectedMeasurementId(null);
      setSelectedId(change.value);
    } else if (change.kind === "page") {
      setSelectedMeasurementId(null);
      setPageNumber(change.value);
    } else {
      const currentGroups = cache.getQueryData<PlanMeasurementGroup[]>(["plan-measurement-groups", projectId, selectedId]) ?? groups.data;
      const group = currentGroups?.find((candidate) => candidate.id === change.value);
      if (group) openWorkspaceDialog({ kind: "DELETE_GROUP", group });
    }
  }

  function requestWorkspaceChange(change: PendingWorkspaceChange) {
    if (change.kind === "tool" && change.value === tool) return;
    if (change.kind === "document" && change.value === selectedId) return;
    if (change.kind === "page" && change.value === pageNumber) return;
    if (change.kind === "deleteGroup" && draft.length > 0) {
      setPendingChange(change);
      return;
    }
    if (completedMeasurementDraft) {
      setPendingChange(change);
      return;
    }
    applyWorkspaceChange(change);
  }

  function chooseTool(next: Tool) {
    requestWorkspaceChange({ kind: "tool", value: next });
  }

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setSelectedMeasurementId(null);
    setGroupError("");
  }

  function addPoint(point: PlanPoint) {
    if (["SCALE", "CHECK", "LENGTH"].includes(tool) && draft.length >= 2) return;
    if (draft.length === 0 && draftMeasurementType) setDraftGroupId(selectedGroupId || null);
    setDraft((current) => [...current, point]);
  }

  function referenceLength() {
    return unit === "ft"
      ? { unit, feet: Number(feet), inches: Number(inches) }
      : { unit, value: Number(lengthValue) };
  }

  async function saveScale() {
    if (!selected || draft.length !== 2 || !pageSize.width) return;
    setSaving(true);
    setActionError("");
    try {
      const existing = page.data?.calibration;
      const selectedReference = { points: draft as [PlanPoint, PlanPoint], length: referenceLength() };
      const body = tool === "CHECK" && existing
        ? {
            pageNumber, pageWidth: pageSize.width, pageHeight: pageSize.height,
            reference: {
              points: existing.referenceGeometry.points,
              length: { unit: "m", value: Number(existing.referenceLengthMeters) },
            },
            checkReference: selectedReference,
            version: existing.version,
          }
        : {
            pageNumber, pageWidth: pageSize.width, pageHeight: pageSize.height,
            reference: selectedReference,
            version: existing?.version,
          };
      await api(`/projects/${projectId}/plans/${selected.id}/calibration`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setDraft([]);
      setTool("SELECT");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["plan-page", projectId, selected.id, pageNumber] }),
        cache.invalidateQueries({ queryKey: ["plan-measurements", projectId] }),
      ]);
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveMeasurement() {
    if (measurementSaveInFlight.current || !selected || !pageSize.width || !draftLabel.trim() || !draftMeasurementType || draftMetricQuantity === null || !draftGroupId) return false;
    measurementSaveInFlight.current = true;
    const type = draftMeasurementType;
    setSaving(true);
    setActionError("");
    try {
      await api(`/projects/${projectId}/plans/${selected.id}/measurements`, {
        method: "POST",
        body: JSON.stringify({
          pageNumber,
          groupId: draftGroupId,
          pageWidth: pageSize.width,
          pageHeight: pageSize.height,
          type,
          label: draftLabel.trim(),
          geometry: { points: draft },
        }),
      });
      setDraft([]);
      setDraftGroupId(null);
      setDraftLabel("");
      setTool("SELECT");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["plan-page", projectId, selected.id, pageNumber] }),
        cache.invalidateQueries({ queryKey: ["plan-measurements", projectId] }),
        cache.invalidateQueries({ queryKey: ["plan-measurement-groups", projectId, selected.id] }),
      ]);
      return true;
    } catch (error) {
      setActionError((error as Error).message);
      return false;
    } finally {
      measurementSaveInFlight.current = false;
      setSaving(false);
    }
  }

  async function updateMeasurement(measurement: PlanMeasurement, changes: object) {
    setActionError("");
    try {
      await api(`/plan-measurements/${measurement.id}`, {
        method: "PUT",
        body: JSON.stringify({ version: measurement.version, ...changes }),
      });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["plan-page", projectId] }),
        cache.invalidateQueries({ queryKey: ["plan-measurements", projectId] }),
        cache.invalidateQueries({ queryKey: ["plan-measurement-groups", projectId] }),
      ]);
      return null;
    } catch (error) {
      const message = (error as Error).message;
      setActionError(message);
      return message;
    }
  }

  const closeWorkspaceDialog = useCallback(() => {
    if (groupBusy) return;
    setWorkspaceDialog(null);
    setDialogError("");
  }, [groupBusy]);

  function openWorkspaceDialog(dialog: WorkspaceDialog) {
    setWorkspaceDialog(dialog);
    setDialogValue(
      dialog.kind === "RENAME_GROUP"
        ? dialog.group.name
        : dialog.kind === "EDIT_MEASUREMENT"
          ? dialog.measurement.label
          : "",
    );
    setDialogError("");
    if (dialog.kind === "DELETE_GROUP") {
      setDeleteDestination(groups.data?.find((group) => group.id !== dialog.group.id)?.id ?? "NEW");
      setDeleteNewGroupName("");
    }
  }

  async function createGroup(name: string) {
    if (!selected) return;
    setGroupBusy(true);
    setDialogError("");
    try {
      const group = await api<PlanMeasurementGroup>(`/projects/${projectId}/plans/${selected.id}/measurement-groups`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      await cache.invalidateQueries({ queryKey: ["plan-measurement-groups", projectId, selected.id] });
      selectGroup(group.id);
      setOpenGroupIds((current) => new Set(current).add(group.id));
      setWorkspaceDialog(null);
    } catch (error) {
      setDialogError((error as Error).message);
    } finally {
      setGroupBusy(false);
    }
  }

  async function renameGroup(group: PlanMeasurementGroup, name: string) {
    setGroupBusy(true);
    setDialogError("");
    try {
      await api(`/plan-measurement-groups/${group.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, version: group.version }),
      });
      await cache.invalidateQueries({ queryKey: ["plan-measurement-groups", projectId, selectedId] });
      setWorkspaceDialog(null);
    } catch (error) {
      setDialogError((error as Error).message);
    } finally {
      setGroupBusy(false);
    }
  }

  async function deleteGroup(group: PlanMeasurementGroup) {
    if (deleteInFlight.current) return;
    const hasMeasurements = group._count.measurements > 0;
    if (hasMeasurements && deleteDestination === "NEW" && (!deleteNewGroupName.trim() || deleteNewGroupName.trim().length > 100)) {
      setDialogError("Enter a destination group name of 1–100 characters.");
      return;
    }
    if (hasMeasurements && !deleteDestination) {
      setDialogError("Choose a destination group.");
      return;
    }
    deleteInFlight.current = true;
    setGroupBusy(true);
    setDialogError("");
    try {
      const result = await api<{ destinationGroupId: string | null; movedCount: number }>(`/plan-measurement-groups/${group.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          version: group.version,
          ...(hasMeasurements && deleteDestination === "NEW"
            ? { newGroupName: deleteNewGroupName.trim() }
            : hasMeasurements ? { destinationGroupId: deleteDestination } : {}),
        }),
      });
      setOpenGroupIds((current) => {
        const next = new Set(current);
        next.delete(group.id);
        return next;
      });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["plan-measurement-groups", projectId, selectedId] }),
        cache.invalidateQueries({ queryKey: ["plan-measurements", projectId] }),
        cache.invalidateQueries({ queryKey: ["plan-page", projectId, selectedId] }),
      ]);
      const refreshed = cache.getQueryData<PlanMeasurementGroup[]>(["plan-measurement-groups", projectId, selectedId]) ?? [];
      if (selectedGroupId === group.id)
        selectGroup(result.destinationGroupId ?? refreshed[0]?.id ?? "");
      setSelectedMeasurementId(null);
      setWorkspaceDialog(null);
    } catch (error) {
      setDialogError((error as Error).message);
    } finally {
      deleteInFlight.current = false;
      setGroupBusy(false);
    }
  }

  async function deleteMeasurement(measurement: PlanMeasurement) {
    setGroupBusy(true);
    setDialogError("");
    try {
      await api(`/plan-measurements/${measurement.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: measurement.version }),
      });
      if (selectedMeasurementId === measurement.id) setSelectedMeasurementId(null);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["plan-page", projectId] }),
        cache.invalidateQueries({ queryKey: ["plan-measurements", projectId] }),
        cache.invalidateQueries({ queryKey: ["plan-measurement-groups", projectId, selectedId] }),
      ]);
      setWorkspaceDialog(null);
    } catch (error) {
      setDialogError((error as Error).message);
    } finally {
      setGroupBusy(false);
    }
  }

  const revisionMeasurements = useMemo(
    () => (summary.data ?? []).filter((measurement) => measurement.documentId === selectedId),
    [summary.data, selectedId],
  );
  const totals = useMemo(() => measurementTotals(revisionMeasurements), [revisionMeasurements]);
  const visibleMeasurements = useMemo(() => {
    const currentPageMeasurements = page.data?.measurements ?? [];
    return showAllGroups
      ? currentPageMeasurements
      : currentPageMeasurements.filter((measurement) => measurement.groupId === selectedGroupId);
  }, [page.data?.measurements, selectedGroupId, showAllGroups]);

  useEffect(() => {
    if (selectedMeasurementId && !visibleMeasurements.some((measurement) => measurement.id === selectedMeasurementId))
      setSelectedMeasurementId(null);
  }, [selectedMeasurementId, visibleMeasurements]);

  async function submitWorkspaceDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceDialog || groupBusy) return;
    const value = dialogValue.trim();
    if (workspaceDialog.kind === "CREATE_GROUP" || workspaceDialog.kind === "RENAME_GROUP") {
      if (!value) {
        setDialogError("Group name is required.");
        return;
      }
      if (value.length > 100) {
        setDialogError("Group name must be 100 characters or fewer.");
        return;
      }
      if (workspaceDialog.kind === "CREATE_GROUP") await createGroup(value);
      else if (value === workspaceDialog.group.name) closeWorkspaceDialog();
      else await renameGroup(workspaceDialog.group, value);
      return;
    }
    if (workspaceDialog.kind === "EDIT_MEASUREMENT") {
      if (!value) {
        setDialogError("Measurement label is required.");
        return;
      }
      if (value.length > 160) {
        setDialogError("Measurement label must be 160 characters or fewer.");
        return;
      }
      if (value === workspaceDialog.measurement.label) {
        closeWorkspaceDialog();
        return;
      }
      setGroupBusy(true);
      setDialogError("");
      const error = await updateMeasurement(workspaceDialog.measurement, { label: value });
      setGroupBusy(false);
      if (error) setDialogError(error);
      else setWorkspaceDialog(null);
    }
  }

  if (plans.isPending) return <section className="panel"><p className="empty">Loading plan documents…</p></section>;
  if (plans.isError)
    return <section className="panel"><p className="error" role="alert">{plans.error.message} <button onClick={() => void plans.refetch()}>Retry</button></p></section>;
  if (!plans.data.length)
    return <section className="panel"><div className="empty"><h3>No drawing plans available</h3><p>Upload a PDF, PNG or JPEG in the Documents tab under Drawings.</p></div></section>;

  return (
    <section className="plans-workspace" aria-label="Plan measurement workspace">
      <div className="panel plan-toolbar">
        <label>
          Drawing revision
          <select value={selectedId} onChange={(event) => requestWorkspaceChange({ kind: "document", value: event.target.value })}>
            {plans.data.map((document) => (
              <option key={document.id} value={document.id}>
                {document.fileName} · V{document.version} · {document.status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        {selected?.fileType === "application/pdf" && (
          <label>
            Page
            <select value={pageNumber} onChange={(event) => requestWorkspaceChange({ kind: "page", value: Number(event.target.value) })}>
              {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            </select>
          </label>
        )}
        <label className="plan-display-units">
          Display units
          <select value={displayUnits} onChange={(event) => setDisplayUnits(event.target.value as DisplayUnitSystem)}>
            <option value="METRIC">Metric (m, m²)</option>
            <option value="IMPERIAL">Imperial (ft, ft²)</option>
          </select>
        </label>
        <div className="plan-view-actions">
          <button onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.min(5, value + 0.25))}>+</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Fit</button>
          <button aria-label="Rotate plan left" title="Rotate left" onClick={() => rotateView(-90)}>↶</button>
          <span className="plan-rotation-value">{rotation}°</span>
          <button aria-label="Rotate plan right" title="Rotate right" onClick={() => rotateView(90)}>↷</button>
          <button onClick={() => void viewportRef.current?.requestFullscreen()}>Full screen</button>
        </div>
      </div>

      <div className="plan-layout">
        <aside className={`panel plan-tools${mobileToolsOpen ? " is-open" : ""}`}>
          <div className="plan-group-picker">
            <label>
              Measurement group
              <span className="plan-group-select-wrap">
                {selectedGroup && <span className="plan-group-swatch" style={{ backgroundColor: groupColors.get(selectedGroup.id) }} aria-hidden="true" />}
                <select
                  value={selectedGroupId}
                  disabled={groups.isPending || groupBusy}
                  onChange={(event) => selectGroup(event.target.value)}
                >
                  {!groups.data?.length && <option value="">No group selected</option>}
                  {groups.data?.map((group) => (
                    <option key={group.id} value={group.id} style={{ color: groupColors.get(group.id) }}>
                      ● {group.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <div className="plan-active-group">
              <strong>{selectedGroup?.name ?? "No group selected"}</strong>
              {selectedGroup && <span className="plan-active-badge">Active</span>}
            </div>
            <label className="plan-show-all-toggle">
              <input
                type="checkbox"
                checked={showAllGroups}
                onChange={(event) => {
                  setShowAllGroups(event.target.checked);
                  setSelectedMeasurementId(null);
                }}
              />
              Show all groups
            </label>
            <div className="plan-group-actions">
              <button aria-label="New measurement group" title="New group" disabled={groupBusy} onClick={() => openWorkspaceDialog({ kind: "CREATE_GROUP" })}>＋ <span>New group</span></button>
              <button className="plan-icon-button" aria-label="Rename selected group" title="Rename group" disabled={!selectedGroup || groupBusy} onClick={() => selectedGroup && openWorkspaceDialog({ kind: "RENAME_GROUP", group: selectedGroup })}>✎</button>
              <button className="plan-icon-button danger" aria-label="Delete selected group" title="Delete empty group" disabled={!selectedGroup || groupBusy} onClick={() => selectedGroup && openWorkspaceDialog({ kind: "DELETE_GROUP", group: selectedGroup })}>×</button>
            </div>
            {groups.isError && <p className="error" role="alert">{groups.error.message}</p>}
            {groupError && <p className="error" role="alert">{groupError}</p>}
          </div>
          <button type="button" className="plan-mobile-tools-toggle" aria-expanded={mobileToolsOpen}
            onClick={() => setMobileToolsOpen((open) => !open)}>
            Measurement tools · {toolDetails[tool].label} <span aria-hidden="true">{mobileToolsOpen ? "▴" : "▾"}</span>
          </button>
          <h2>Measurement tools</h2>
          <div className="plan-tool-buttons">
            {(["PAN", "SELECT", "SCALE", ...(page.data?.calibration ? ["CHECK"] : []), "LENGTH", "AREA", "COUNT"] as Tool[]).map((value) => (
              <button
                key={value}
                className={tool === value ? "active" : ""}
                aria-label={toolDetails[value].label}
                aria-pressed={tool === value}
                title={toolDetails[value].hint}
                onClick={() => chooseTool(value)}
              >
                <span className="plan-tool-icon" aria-hidden="true">{toolDetails[value].icon}</span>
                <span>{toolDetails[value].label}</span>
              </button>
            ))}
          </div>
          <p className="muted plan-tool-help">{toolDetails[tool].hint}.</p>
          {draft.length > 0 && (
            <div className="plan-draft-actions">
              <span>{draft.length} point{draft.length === 1 ? "" : "s"}</span>
              <div>
                <button className="plan-icon-button" aria-label="Undo last point" title="Undo last point" onClick={() => setDraft((points) => points.slice(0, -1))}>↶</button>
                <button className="plan-icon-button" aria-label="Cancel draft" title="Cancel draft" onClick={discardMeasurementDraft}>×</button>
              </div>
            </div>
          )}
          {(tool === "SCALE" || tool === "CHECK") && draft.length === 2 && (
            <div className="plan-save-form">
              <label>Unit<select value={unit} onChange={(event) => setUnit(event.target.value as typeof unit)}>{["mm", "cm", "m", "ft", "in"].map((value) => <option key={value}>{value}</option>)}</select></label>
              {unit === "ft" ? (
                <div className="plan-feet-inputs">
                  <label>Feet<input type="number" min="0" value={feet} onChange={(event) => setFeet(event.target.value)} /></label>
                  <label>Inches<input type="number" min="0" max="11.999" step="0.01" value={inches} onChange={(event) => setInches(event.target.value)} /></label>
                </div>
              ) : <label>Actual length<input type="number" min="0" step="any" value={lengthValue} onChange={(event) => setLengthValue(event.target.value)} /></label>}
              <button className="primary" disabled={saving} onClick={() => void saveScale()}>{saving ? "Saving…" : tool === "CHECK" ? "Save Check" : "Save Scale"}</button>
            </div>
          )}
          {page.data?.calibration ? (
            <div className="plan-calibration-status">
              <strong>Scale calibrated</strong>
              <span>{formatPlanQuantity("LENGTH", Number(page.data.calibration.referenceLengthMeters), displayUnits)} reference</span>
              {page.data.calibration.checkDifferencePercent !== null && (
                <span>Check difference: {page.data.calibration.checkDifferencePercent.toFixed(2)}%</span>
              )}
            </div>
          ) : <p className="plan-warning">Lengths and areas require a saved scale.</p>}
          {actionError && !draftMeasurementType && <p className="error" role="alert">{actionError}</p>}
        </aside>

        <div
          className="plan-viewport"
          ref={viewportRef}
          onWheel={(event) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            setZoom((value) => Math.min(5, Math.max(0.25, value + (event.deltaY < 0 ? 0.1 : -0.1))));
          }}
        >
          {fileLoading && <p className="plan-view-state">Loading plan…</p>}
          {fileError && <p className="error plan-view-state" role="alert">{fileError}</p>}
          {!fileLoading && !fileError && (
            <div
              className="plan-stage"
              style={{
                width: stageWidth,
                height: stageHeight,
                transform: `translate(${pan.x}px, ${pan.y}px)`,
              }}
            >
              <div
                className="plan-surface"
                style={{ width: surfaceWidth, height: surfaceHeight, transform: rotationTransform }}
              >
                {selected?.fileType === "application/pdf" ? (
                  <canvas ref={canvasRef} style={{ width: surfaceWidth, height: surfaceHeight }} />
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={selected?.fileName ?? "Plan"}
                    style={{ width: surfaceWidth, height: surfaceHeight }}
                    onLoad={(event) => setPageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                  />
                ) : null}
                {pageSize.width > 0 && (
                  <PlanOverlay
                    width={pageSize.width}
                    height={pageSize.height}
                    measurements={visibleMeasurements}
                    calibration={page.data?.calibration ?? null}
                    draft={draft}
                    tool={tool}
                    rotation={rotation}
                    svgRef={svgRef}
                    onPoint={addPoint}
                    onPanStart={(event) => {
                      if (tool !== "PAN") return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      panStart.current = { x: event.clientX, y: event.clientY, left: pan.x, top: pan.y };
                    }}
                    onPanMove={(event) => {
                      if (!panStart.current || tool !== "PAN") return;
                      setPan({
                        x: panStart.current.left + event.clientX - panStart.current.x,
                        y: panStart.current.top + event.clientY - panStart.current.y,
                      });
                    }}
                    onPanEnd={(event) => {
                      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      panStart.current = null;
                    }}
                    onGesture={(scale, deltaX, deltaY) => {
                      setZoom((value) => Math.min(5, Math.max(.25, value * Math.min(1.3, Math.max(.77, scale)))));
                      setPan((value) => ({ x: value.x + deltaX, y: value.y + deltaY }));
                    }}
                    selectedMeasurementId={selectedMeasurementId}
                    onSelectMeasurement={setSelectedMeasurementId}
                  />
                )}
              </div>
            </div>
          )}
          {draft.length > 0 && draftMeasurementType && (
            <aside className="plan-result-box" aria-label="Unsaved measurement result">
              <div className="plan-result-heading">
                <span aria-hidden="true">{toolDetails[tool].icon}</span>
                <div>
                  <small>UNSAVED {draftMeasurementType}</small>
                  <strong>{draftMetricQuantity === null
                    ? !page.data?.calibration && draftMeasurementType !== "COUNT"
                      ? "Scale required"
                      : draftMeasurementType === "LENGTH" ? "Select second point" : "Add at least 3 points"
                    : formatPlanQuantity(draftMeasurementType, draftMetricQuantity, displayUnits)}</strong>
                </div>
              </div>
              <p className="plan-result-group">Group: <strong>{draftGroup?.name ?? "No group selected"}</strong></p>
              {draftGroupId && selectedGroupId !== draftGroupId && <p>The active group changed; this draft will remain assigned to {draftGroup?.name ?? "its original group"}.</p>}
              {draftMeasurementType === "COUNT" && <p>{draft.length} point{draft.length === 1 ? "" : "s"} in this group</p>}
              <label>
                Label
                <input value={draftLabel} maxLength={160} onChange={(event) => setDraftLabel(event.target.value)} placeholder={draftMeasurementType === "COUNT" ? "e.g. Doors" : "Measurement label"} />
              </label>
              <div className="plan-result-actions">
                <button onClick={discardMeasurementDraft}>Discard</button>
                {!draftGroupId && selectedGroup && <button onClick={() => setDraftGroupId(selectedGroup.id)}>Use {selectedGroup.name}</button>}
                {completedMeasurementDraft && (
                  <button className="primary" disabled={saving || !draftLabel.trim() || draftMetricQuantity === null || !draftGroupId} onClick={() => void saveMeasurement()}>
                    {saving ? "Saving…" : "Add to List"}
                  </button>
                )}
              </div>
              {!draftGroupId && <p className="error">Choose or create a group before adding this measurement.</p>}
              {actionError && <p className="error" role="alert">{actionError}</p>}
            </aside>
          )}
        </div>
      </div>

      <section className="panel plan-summary" aria-labelledby="plan-summary-heading">
        <div className="plan-summary-header">
          <h2 id="plan-summary-heading">Quantity summary</h2>
          <div className="plan-all-groups-total">
            <span>All groups total</span>
            <div className="plan-total-strip">
            <span>Length <strong>{formatPlanQuantity("LENGTH", totals.length, displayUnits)}</strong></span>
            <span>Area <strong>{formatPlanQuantity("AREA", totals.area, displayUnits)}</strong></span>
            <span>Count <strong>{Math.round(totals.count)}</strong></span>
            </div>
          </div>
        </div>
        <div className="plan-count-groups" aria-label="Count groups">
          {Object.entries(totals.counts).map(([label, value]) => <span key={label}>{label} <strong>{value}</strong></span>)}
        </div>
        {summary.isPending || groups.isPending ? <p className="empty">Loading quantities…</p>
          : summary.isError ? <p className="error" role="alert">{summary.error.message}</p>
          : groups.isError ? <p className="error" role="alert">{groups.error.message}</p>
          : !groups.data?.length ? <p className="empty">No measurement groups yet. Create a group to organize quantities for this drawing revision.</p>
          : (
            <div className="plan-measurement-groups">
              {groups.data.map((group) => {
                const measurements = revisionMeasurements.filter((measurement) => measurement.groupId === group.id);
                const groupTotals = measurementTotals(measurements);
                const active = group.id === selectedGroupId;
                const groupColor = groupColors.get(group.id) ?? measurementGroupColor(group.id);
                return (
                  <details
                    className={`plan-measurement-group${active ? " active" : ""}`}
                    key={group.id}
                    open={openGroupIds.has(group.id)}
                    onToggle={(event) => {
                      const open = event.currentTarget.open;
                      setOpenGroupIds((current) => {
                        const next = new Set(current);
                        if (open) next.add(group.id);
                        else next.delete(group.id);
                        return next;
                      });
                    }}
                    style={{ "--group-color": groupColor } as CSSProperties}
                  >
                    <summary>
                      <span className="plan-group-heading-name">
                        <span className="plan-group-swatch" style={{ backgroundColor: groupColor }} aria-hidden="true" />
                        <span><strong>{group.name}</strong><small>{measurements.length} measurement{measurements.length === 1 ? "" : "s"}</small></span>
                        {active && <span className="plan-active-badge">Active</span>}
                      </span>
                      <span className="plan-group-totals">
                        <span>Length <strong>{formatPlanQuantity("LENGTH", groupTotals.length, displayUnits)}</strong></span>
                        <span>Area <strong>{formatPlanQuantity("AREA", groupTotals.area, displayUnits)}</strong></span>
                        <span>Count <strong>{Math.round(groupTotals.count)}</strong></span>
                      </span>
                    <button
                      type="button"
                      className="plan-group-delete-button danger"
                      title={`Delete group ${group.name}`}
                      aria-label="Delete group"
                      disabled={groupBusy}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        requestWorkspaceChange({ kind: "deleteGroup", value: group.id });
                      }}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" /></svg>
                    </button>
                    </summary>
                    {Object.keys(groupTotals.counts).length > 0 && (
                      <div className="plan-count-groups">
                        {Object.entries(groupTotals.counts).map(([label, value]) => <span key={label}>{label} <strong>{Math.round(value)}</strong></span>)}
                      </div>
                    )}
                    {measurements.length === 0 ? <p className="plan-group-empty">No saved measurements in this group.</p> : <div className="plan-saved-list">
                      {measurements.map((measurement) => (
                  <article className={`plan-saved-row${selectedMeasurementId === measurement.id ? " selected" : ""}`} key={measurement.id}>
                    <div className="plan-saved-primary">
                      <strong title={measurement.label}>{measurement.label}</strong>
                      <span>{measurement.type} · Page {measurement.pageNumber}</span>
                    </div>
                    <strong className="plan-saved-quantity">{quantityLabel(measurement, displayUnits)}</strong>
                    {measurement.confirmed ? <span className="status status-approved">Confirmed</span> : <span className="status">Needs review</span>}
                    <div className="plan-row-actions" aria-label={`Actions for ${measurement.label}`}>
                        <select
                          aria-label={`Move ${measurement.label} to group`}
                          title="Move to group"
                          value={measurement.groupId}
                          onChange={(event) => {
                            setSelectedMeasurementId(null);
                            void updateMeasurement(measurement, { groupId: event.target.value });
                          }}
                        >
                          {groups.data.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}
                        </select>
                        {!measurement.confirmed && <button aria-label={`Confirm ${measurement.label}`} title="Confirm" onClick={() => void updateMeasurement(measurement, { confirmed: true })}>✓</button>}
                        <button aria-label={`Edit ${measurement.label}`} title="Edit label" onClick={() => openWorkspaceDialog({ kind: "EDIT_MEASUREMENT", measurement })}>✎</button>
                        <button className="danger" aria-label={`Delete ${measurement.label}`} title="Delete" onClick={() => openWorkspaceDialog({ kind: "DELETE_MEASUREMENT", measurement })}>×</button>
                    </div>
                  </article>
                      ))}
                    </div>}
                  </details>
                );
              })}
            </div>
          )}
      </section>
      {pendingChange && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal plan-draft-guard" role="dialog" aria-modal="true" aria-labelledby="draft-guard-heading">
            <h2 id="draft-guard-heading">Unsaved measurement</h2>
            <p>This measurement has not been added to the list. Save it, discard it, or stay on the current drawing.</p>
            <div className="plan-draft-guard-actions">
              <button onClick={() => setPendingChange(null)}>Stay</button>
              <button onClick={() => { const next = pendingChange; setPendingChange(null); discardMeasurementDraft(); applyWorkspaceChange(next); }}>Discard</button>
              <button
                className="primary"
                disabled={saving || !draftLabel.trim() || draftMetricQuantity === null || !draftGroupId}
                onClick={() => void (async () => {
                  const next = pendingChange;
                  if (await saveMeasurement()) {
                    setPendingChange(null);
                    applyWorkspaceChange(next);
                  }
                })()}
              >
                {saving ? "Saving…" : "Save and continue"}
              </button>
            </div>
            {actionError && <p className="error" role="alert">{actionError}</p>}
            {!draftLabel.trim() && <small>Enter a measurement label before saving.</small>}
          </section>
        </div>
      )}
      {workspaceDialog && (
        <MeasurementDialog
          title={workspaceDialog.kind === "CREATE_GROUP"
            ? "Create measurement group"
            : workspaceDialog.kind === "RENAME_GROUP"
              ? "Rename measurement group"
              : workspaceDialog.kind === "DELETE_GROUP"
                ? "Delete measurement group?"
                : workspaceDialog.kind === "EDIT_MEASUREMENT"
                  ? "Edit measurement label"
                  : "Delete measurement?"}
          labelledBy="plan-management-dialog-title"
          onClose={closeWorkspaceDialog}
          initialFocusRef={workspaceDialog.kind === "CREATE_GROUP" || workspaceDialog.kind === "RENAME_GROUP" || workspaceDialog.kind === "EDIT_MEASUREMENT" ? dialogInputRef : undefined}
          role={workspaceDialog.kind === "DELETE_GROUP" || workspaceDialog.kind === "DELETE_MEASUREMENT" ? "alertdialog" : "dialog"}
        >
          {workspaceDialog.kind === "CREATE_GROUP" || workspaceDialog.kind === "RENAME_GROUP" ? (
            <form onSubmit={(event) => void submitWorkspaceDialog(event)}>
              <p className="plan-dialog-context">
                Drawing revision: <strong>{selected?.fileName} · V{selected?.version}</strong>
              </p>
              <label className="modal-field">
                Group name
                <input
                  ref={dialogInputRef}
                  value={dialogValue}
                  maxLength={100}
                  placeholder="e.g. Ground floor walls"
                  onChange={(event) => {
                    setDialogValue(event.target.value);
                    setDialogError("");
                  }}
                />
              </label>
              {dialogError && <p className="error" role="alert">{dialogError}</p>}
              <div className="modal-actions">
                <button type="button" disabled={groupBusy} onClick={closeWorkspaceDialog}>Cancel</button>
                <button className="primary" disabled={groupBusy} type="submit">
                  {groupBusy ? "Saving…" : workspaceDialog.kind === "CREATE_GROUP" ? "Create group" : "Rename group"}
                </button>
              </div>
            </form>
          ) : workspaceDialog.kind === "DELETE_GROUP" ? (
            <div>
              <p>Delete <strong>{workspaceDialog.group.name}</strong> from this drawing revision?</p>
              <p className="plan-dialog-rule">Measurements are never deleted with a group. They must be moved to another group in this drawing revision.</p>
              {workspaceDialog.group._count.measurements > 0 && <>
                <p>This group contains {workspaceDialog.group._count.measurements} measurement{workspaceDialog.group._count.measurements === 1 ? "" : "s"}. The move and deletion will happen together.</p>
                <label className="modal-field">Move measurements to
                  <select value={deleteDestination} onChange={(event) => { setDeleteDestination(event.target.value); setDialogError(""); }}>
                    {groups.data?.filter((candidate) => candidate.id !== workspaceDialog.group.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                    <option value="NEW">Create a new group</option>
                  </select>
                </label>
                {deleteDestination === "NEW" && <label className="modal-field">New destination group name
                  <input maxLength={100} value={deleteNewGroupName} placeholder="e.g. Ground floor walls" onChange={(event) => { setDeleteNewGroupName(event.target.value); setDialogError(""); }} />
                </label>}
              </>}
              {dialogError && <p className="error" role="alert">{dialogError}</p>}
              <div className="modal-actions">
                <button type="button" disabled={groupBusy} onClick={closeWorkspaceDialog}>Cancel</button>
                <button className="danger" type="button" disabled={groupBusy} onClick={() => void deleteGroup(workspaceDialog.group)}>
                  {groupBusy ? "Deleting…" : workspaceDialog.group._count.measurements > 0 ? "Move measurements and delete group" : "Delete group"}
                </button>
              </div>
            </div>
          ) : workspaceDialog.kind === "EDIT_MEASUREMENT" ? (
            <form onSubmit={(event) => void submitWorkspaceDialog(event)}>
              <label className="modal-field">
                Measurement label
                <input
                  ref={dialogInputRef}
                  value={dialogValue}
                  maxLength={160}
                  onChange={(event) => {
                    setDialogValue(event.target.value);
                    setDialogError("");
                  }}
                />
              </label>
              {dialogError && <p className="error" role="alert">{dialogError}</p>}
              <div className="modal-actions">
                <button type="button" disabled={groupBusy} onClick={closeWorkspaceDialog}>Cancel</button>
                <button className="primary" disabled={groupBusy} type="submit">{groupBusy ? "Saving…" : "Save label"}</button>
              </div>
            </form>
          ) : (
            <div>
              <p>Delete <strong>{workspaceDialog.measurement.label}</strong>? This removes only this saved measurement.</p>
              {dialogError && <p className="error" role="alert">{dialogError}</p>}
              <div className="modal-actions">
                <button type="button" disabled={groupBusy} onClick={closeWorkspaceDialog}>Cancel</button>
                <button className="danger" type="button" disabled={groupBusy} onClick={() => void deleteMeasurement(workspaceDialog.measurement)}>
                  {groupBusy ? "Deleting…" : "Delete measurement"}
                </button>
              </div>
            </div>
          )}
        </MeasurementDialog>
      )}
    </section>
  );
}
