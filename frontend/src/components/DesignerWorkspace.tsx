import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "react-router-dom";
import { api } from "../lib/api";
import { feetAndInchesToMetres } from "../lib/unitConverter";
import { calculateDesignerQuantities } from "../lib/designerQuantities";
import { modelDistance, projectToWall } from "../lib/designerGeometry";
import { connectionTarget, createsTrimCycle, plannedConnections, type EndIntents } from "../lib/designerConnections";
import type { DesignerJunction, DesignerModel, DesignerOpening, DesignerWall, PlanPoint } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { Designer3D } from "./Designer3D";
import { DesignerTopCanvas, type DesignerTool } from "./DesignerTopCanvas";

type Snapshot = { walls: DesignerWall[]; junctions: DesignerJunction[]; name: string; floorHeightMeters: number };
type WallDraft = { id: string | null; start: PlanPoint; end: PlanPoint; label: string;
  lengthMeters: number; heightMeters: number; thicknessMeters: number;
  alignment: DesignerWall["alignment"]; intents: EndIntents };
type OpeningDraft = DesignerOpening & { wallId: string; existing: boolean };
const makeId = () => crypto.randomUUID();
const face = (side: "A" | "B", height: number) => ({ side, roomName: null,
  plaster: false, plasterHeightMeters: height, paint: false, paintHeightMeters: height });
const offsetForAlignment = (alignment: DesignerWall["alignment"], thickness: number) =>
  alignment === "INSIDE" ? -thickness / 2 : alignment === "OUTSIDE" ? thickness / 2 : 0;
function alignPoints(start: PlanPoint, end: PlanPoint, offset: number) {
  const length = modelDistance(start, end);
  if (!length) return { start, end };
  const dx = -(end.y - start.y) / length * offset, dy = (end.x - start.x) / length * offset;
  return { start: { x: start.x + dx, y: start.y + dy }, end: { x: end.x + dx, y: end.y + dy } };
}
function SignedPosition({ label, metres, unit, onChange }: { label: string; metres: number;
  unit: "METRIC" | "IMPERIAL"; onChange: (value: number) => void }) {
  const [raw, setRaw] = useState(String(unit === "METRIC" ? metres : metres / .3048));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setRaw(String(unit === "METRIC" ? metres : metres / .3048)); }, [metres, unit]);
  return <label>{label} ({unit === "METRIC" ? "m" : "ft"})<input type="number" step="any" value={raw}
    onFocus={() => { editing.current = true; }} onBlur={() => { editing.current = false; setRaw(String(unit === "METRIC" ? metres : metres / .3048)); }}
    onChange={(event) => { setRaw(event.target.value); const parsed = Number(event.target.value);
      if (event.target.value.trim() && Number.isFinite(parsed)) onChange(parsed * (unit === "METRIC" ? 1 : .3048)); }} /></label>;
}
function Scalar({ label, value, unit, onChange }: { label: string; value: number; unit: "METRIC" | "IMPERIAL";
  onChange: (value: number) => void }) {
  const [raw, setRaw] = useState(String(value));
  const [feet, setFeet] = useState(String(Math.floor(value / .3048)));
  const [inches, setInches] = useState(String(value / .0254 - Math.floor(value / .3048) * 12));
  useEffect(() => { setRaw(String(value)); setFeet(String(Math.floor(value / .3048)));
    setInches(String(value / .0254 - Math.floor(value / .3048) * 12)); }, [value, unit]);
  if (unit === "IMPERIAL") return <fieldset className="designer-scalar"><legend>{label}</legend>
    <label>Feet<input type="number" min="0" step="1" value={feet} onChange={(event) => {
      setFeet(event.target.value); const parsed = feetAndInchesToMetres(event.target.value, inches);
      if (parsed.value !== null) onChange(parsed.value);
    }} /></label><label>Inches<input type="number" min="0" max="11.999" step="any" value={inches}
      onChange={(event) => { setInches(event.target.value); const parsed = feetAndInchesToMetres(feet, event.target.value);
        if (parsed.value !== null) onChange(parsed.value); }} /></label></fieldset>;
  return <label>{label} (m)<input type="number" min="0" step="any" value={raw}
    onChange={(event) => { setRaw(event.target.value); if (event.target.value.trim()) onChange(Number(event.target.value)); }} /></label>;
}
function EditorDialog({ title, children, onCancel, onSubmit, error, submitLabel }: {
  title: string; children: React.ReactNode; onCancel: () => void; onSubmit: (event: FormEvent) => void;
  error: string; submitLabel: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const cancelRef = useRef(onCancel);
  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); cancelRef.current(); }
      if (event.key !== "Tab") return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("input,select,button") ?? []);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prior?.focus(); };
  }, []);
  return <div className="modal-backdrop"><form ref={ref} className="modal-card modal-card-small plan-management-dialog designer-dialog"
    role="dialog" aria-modal="true" aria-label={title} onSubmit={onSubmit}>
    <h2>{title}</h2><div className="designer-dialog-body">{children}{error && <p className="error" role="alert">{error}</p>}</div>
    <div className="modal-actions"><button type="button" onClick={onCancel}>Cancel</button>
      <button className="primary" type="submit">{submitLabel}</button></div>
  </form></div>;
}

export function DesignerWorkspace({ projectId }: { projectId: string }) {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["designer", projectId], queryFn: () => api<DesignerModel | null>(`/projects/${projectId}/designer`) });
  const model = query.data;
  const [name, setName] = useState("Ground floor");
  const [floorHeightMeters, setFloorHeight] = useState(3);
  const [walls, setWalls] = useState<DesignerWall[]>([]);
  const [junctions, setJunctions] = useState<DesignerJunction[]>([]);
  const [undo, setUndo] = useState<Snapshot[]>([]);
  const [redo, setRedo] = useState<Snapshot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [tool, setTool] = useState<DesignerTool>("SELECT");
  const [view, setView] = useState<"TOP" | "3D">("TOP");
  const [units, setUnits] = useState<"METRIC" | "IMPERIAL">("METRIC");
  const [axisLock, setAxisLock] = useState<"FREE" | "HORIZONTAL" | "VERTICAL">("FREE");
  const [fitSignal, setFitSignal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wallDraft, setWallDraft] = useState<WallDraft | null>(null);
  const [openingDraft, setOpeningDraft] = useState<OpeningDraft | null>(null);
  const [deleteWall, setDeleteWall] = useState<DesignerWall | null>(null);
  const [deleteOpening, setDeleteOpening] = useState<DesignerOpening | null>(null);
  const [continuousWallId, setContinuousWallId] = useState("");
  const [adjoiningEnd, setAdjoiningEnd] = useState<"START" | "END">("START");
  const [guardTool, setGuardTool] = useState<DesignerTool | null>(null);
  const [highlightedWallIds, setHighlightedWallIds] = useState<string[]>([]);
  const [focusPoint, setFocusPoint] = useState<PlanPoint | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [placeUnconnected, setPlaceUnconnected] = useState(false);
  const hasDraft = Boolean(wallDraft || openingDraft);
  const blocker = useBlocker(dirty || hasDraft);
  const snapshot = (): Snapshot => ({ walls, junctions, name, floorHeightMeters });
  const selectedWall = walls.find((wall) => wall.id === selectedId || wall.openings.some((opening) => opening.id === selectedId)) ?? null;
  const selectedOpening = selectedWall?.openings.find((opening) => opening.id === selectedId) ?? null;
  const selectedConnections = selectedWall ? junctions.filter((item) =>
    item.adjoiningWallId === selectedWall.id || item.continuousWallId === selectedWall.id) : [];
  const quantity = useMemo(() => { try { return calculateDesignerQuantities(walls, junctions); } catch { return null; } }, [walls, junctions]);
  const quantityError = !quantity && walls.length ? "Correct invalid dimensions or connections before saving." : "";
  const unitArea = units === "METRIC" ? "m²" : "ft²";
  const unitVolume = units === "METRIC" ? "m³" : "ft³";
  const area = (value: number) => `${(value * (units === "METRIC" ? 1 : 1 / .09290304)).toFixed(2)} ${unitArea}`;
  const volume = (value: number) => `${(value * (units === "METRIC" ? 1 : 1 / (.3048 ** 3))).toFixed(3)} ${unitVolume}`;
  const length = (value: number) => `${(value * (units === "METRIC" ? 1 : 1 / .3048)).toFixed(2)} ${units === "METRIC" ? "m" : "ft"}`;
  useEffect(() => {
    if (!model || dirty) return;
    setWalls(model.walls); setJunctions(model.junctions); setName(model.name);
    setFloorHeight(model.floorHeightMeters); setUndo([]); setRedo([]);
  }, [model, dirty]);
  useEffect(() => {
    if (!dirty && !hasDraft) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, hasDraft]);
  function change(next: Snapshot) {
    setUndo((items) => [...items.slice(-49), snapshot()]); setRedo([]);
    setWalls(next.walls); setJunctions(next.junctions); setName(next.name);
    setFloorHeight(next.floorHeightMeters); setDirty(true); setError("");
  }
  function updateWall(id: string, update: (wall: DesignerWall) => DesignerWall) {
    change({ ...snapshot(), walls: walls.map((wall) => wall.id === id ? update(wall) : wall) });
  }
  function cancelDraft() { setWallDraft(null); setOpeningDraft(null); setDialogError(""); setPlaceUnconnected(false); }
  function chooseTool(next: DesignerTool) {
    if (hasDraft) { setGuardTool(next); return; }
    setTool(next); setError("");
  }
  async function create() {
    setSaving(true); setError("");
    try { const result = await api<DesignerModel>(`/projects/${projectId}/designer`, { method: "POST",
      body: JSON.stringify({ name: "Ground floor", floorHeightMeters: 3 }) });
      cache.setQueryData(["designer", projectId], result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create model"); }
    finally { setSaving(false); }
  }
  async function save() {
    if (!model || saving || hasDraft || quantityError) { setError(quantityError || "Finish the current dialog before saving."); return false; }
    if (!name.trim() || !Number.isFinite(floorHeightMeters) || floorHeightMeters <= 0) {
      setError("Enter a model name and a positive finite floor height."); return false;
    }
    setSaving(true); setError("");
    try {
      const result = await api<DesignerModel>(`/projects/${projectId}/designer`, { method: "PUT",
        body: JSON.stringify({ version: model.version, name: name.trim(), floorHeightMeters, walls, junctions }) });
      setDirty(false); cache.setQueryData(["designer", projectId], result); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save model"); return false; }
    finally { setSaving(false); }
  }
  async function review() {
    if (!model || dirty || quantity?.issues.length) return;
    setSaving(true);
    try { const result = await api<DesignerModel>(`/projects/${projectId}/designer/review`, { method: "POST",
      body: JSON.stringify({ version: model.version }) }); cache.setQueryData(["designer", projectId], result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review model"); }
    finally { setSaving(false); }
  }
  function draw(start: PlanPoint, end: PlanPoint, intents: EndIntents) {
    const measured = modelDistance(start, end);
    setWallDraft({ id: null, start, end, label: `Wall ${walls.length + 1}`,
      lengthMeters: measured, heightMeters: floorHeightMeters, thicknessMeters: .2, alignment: "CENTRELINE", intents });
    setPlaceUnconnected(false);
  }
  function moveWall(id: string, start: PlanPoint, end: PlanPoint, intents: EndIntents) {
    const wall = walls.find((item) => item.id === id);
    if (!wall) return;
    const path = alignPoints(start, end, -offsetForAlignment(wall.alignment, wall.thicknessMeters));
    setWallDraft({ id, start: path.start, end: path.end, label: wall.label,
      lengthMeters: modelDistance(start, end), heightMeters: wall.heightMeters,
      thicknessMeters: wall.thicknessMeters, alignment: wall.alignment, intents });
    setSelectedId(id); setPlaceUnconnected(false);
  }
  function pickWall(id: string, point?: PlanPoint, openingType?: "DOOR" | "WINDOW") {
    const wall = walls.find((item) => item.id === id);
    if (!wall) return;
    setSelectedId(id);
    const type = openingType ?? (tool === "DOOR" || tool === "WINDOW" ? tool : null);
    if (!type) return;
    const near = point ? projectToWall(wall, point) : modelDistance({ x: wall.startX, y: wall.startY }, { x: wall.endX, y: wall.endY }) / 2;
    setOpeningDraft({ id: makeId(), wallId: id, existing: false, type,
      label: `${type === "DOOR" ? "Door" : "Window"} ${wall.openings.length + 1}`,
      positionMeters: Math.max(0, near - .5), widthMeters: 1, heightMeters: type === "DOOR" ? 2 : 1.2,
      sillMeters: type === "DOOR" ? 0 : .9 });
  }
  function commitWall(event: FormEvent) {
    event.preventDefault(); if (!wallDraft) return;
    const { start, end, id, alignment, thicknessMeters, heightMeters, lengthMeters } = wallDraft;
    if (!wallDraft.label.trim() || !Number.isFinite(lengthMeters) || lengthMeters <= 0 ||
      !Number.isFinite(heightMeters) || heightMeters <= 0 || !Number.isFinite(thicknessMeters) || thicknessMeters <= 0) {
      setDialogError("Enter a name and positive finite dimensions."); return;
    }
    const drawn = modelDistance(start, end);
    if (drawn <= .001) { setDialogError("Draw a wall direction before entering its length."); return; }
    const rawStart = start, rawEnd = { x: start.x + (end.x - start.x) / drawn * lengthMeters,
      y: start.y + (end.y - start.y) / drawn * lengthMeters };
    const aligned = alignPoints(rawStart, rawEnd, offsetForAlignment(alignment, thicknessMeters));
    const prior = id ? walls.find((wall) => wall.id === id) : null;
    const nextWall: DesignerWall = { id: id ?? makeId(), label: wallDraft.label.trim(),
      startX: aligned.start.x, startY: aligned.start.y, endX: aligned.end.x, endY: aligned.end.y,
      heightMeters, thicknessMeters, alignment,
      faces: prior?.faces ?? [face("A", heightMeters), face("B", heightMeters)],
      openings: prior?.openings ?? [] };
    const nextWalls = prior ? walls.map((wall) => wall.id === id ? nextWall : wall) : [...walls, nextWall];
    const planned = plannedConnections(nextWall, walls.filter((wall) => wall.id !== nextWall.id),
      junctions, placeUnconnected ? { START: null, END: null } : wallDraft.intents, makeId);
    if (!placeUnconnected && planned.warnings.length) { setDialogError(planned.warnings[0]!); return; }
    const nextJunctions = planned.junctions;
    if (createsTrimCycle(nextJunctions)) { setDialogError("This connection would create a cyclic wall trim. Choose another target."); return; }
    try { const validation = calculateDesignerQuantities(nextWalls, nextJunctions);
      const previousIssues = prior ? calculateDesignerQuantities(walls, junctions).issues : [];
      const newIssue = validation.issues.find((issue) => !previousIssues.includes(issue));
      if (newIssue && prior) { setDialogError(`${newIssue} Correct the wall or cancel the edit.`); return; } }
    catch (cause) { setDialogError(cause instanceof Error ? cause.message : "Invalid wall"); return; }
    change({ ...snapshot(), walls: nextWalls, junctions: nextJunctions });
    setSelectedId(nextWall.id); cancelDraft();
  }
  function commitOpening(event: FormEvent) {
    event.preventDefault(); if (!openingDraft) return;
    const wall = walls.find((item) => item.id === openingDraft.wallId)!;
    const { existing, wallId, ...opening } = openingDraft;
    if (!opening.label.trim() || !Number.isFinite(opening.widthMeters) || opening.widthMeters <= 0 ||
      !Number.isFinite(opening.heightMeters) || opening.heightMeters <= 0 ||
      !Number.isFinite(opening.positionMeters) || opening.positionMeters < 0 ||
      !Number.isFinite(opening.sillMeters) || opening.sillMeters < 0 ||
      (opening.type === "DOOR" && opening.sillMeters !== 0)) {
      setDialogError("Enter valid positive dimensions. Doors start at floor level."); return;
    }
    const next = { ...opening, label: opening.label.trim() };
    const updated = { ...wall, openings: existing ? wall.openings.map((item) => item.id === next.id ? next : item) : [...wall.openings, next] };
    const nextWalls = walls.map((item) => item.id === wallId ? updated : item);
    try { calculateDesignerQuantities(nextWalls, junctions); }
    catch (cause) { setDialogError(cause instanceof Error ? cause.message : "Invalid opening"); return; }
    change({ ...snapshot(), walls: nextWalls }); setSelectedId(next.id); cancelDraft();
  }
  function revert(stack: Snapshot[], nextStack: (value: Snapshot[]) => void, other: Snapshot[], setOther: (value: Snapshot[]) => void) {
    const last = stack.at(-1); if (!last) return;
    nextStack(stack.slice(0, -1)); setOther([...other, snapshot()]);
    setWalls(last.walls); setJunctions(last.junctions); setName(last.name); setFloorHeight(last.floorHeightMeters); setDirty(true);
  }
  if (query.isLoading) return <section className="panel">Loading 3D Designer…</section>;
  if (query.isError) return <section className="panel error" role="alert">Could not load 3D Designer.</section>;
  return <section className="designer-workspace">
    <header className="designer-header panel"><div><h2>3D Designer</h2><p>Draw one floor from exact dimensions. No drawing upload or calibration is needed.</p></div>
      {model && <div className="designer-toolbar">
        <button className={view === "TOP" ? "primary" : ""} onClick={() => setView("TOP")}>Top View</button>
        <button className={view === "3D" ? "primary" : ""} onClick={() => setView("3D")}>3D View</button>
        <button onClick={() => setFitSignal((value) => value + 1)}>Fit</button>
        <label>Units <select value={units} onChange={(event) => setUnits(event.target.value as typeof units)}>
          <option value="METRIC">Metric</option><option value="IMPERIAL">Feet + inches</option></select></label>
        <button disabled={!undo.length} onClick={() => revert(undo, setUndo, redo, setRedo)}>Undo</button>
        <button disabled={!redo.length} onClick={() => revert(redo, setRedo, undo, setUndo)}>Redo</button>
        <button className="primary" disabled={!dirty || saving || hasDraft} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
      </div>}
    </header>
    {!model ? <div className="panel designer-empty"><h3>Start your first floor</h3><p>Create a model, choose Wall, then drag on the grid. Enter the exact dimensions before placing it.</p>
      <button className="primary" disabled={saving} onClick={() => void create()}>Create 3D model</button></div> : <>
      <div className="designer-layout">
        <aside className="panel designer-tools"><h3>Tools</h3>
          {([ ["SELECT", "↖", "Select"], ["WALL", "▰", "Wall"], ["DOOR", "▯", "Door"],
            ["WINDOW", "▤", "Window"], ["PAN", "✥", "Pan / Orbit"] ] as const).map(([id, icon, label]) =>
            <button key={id} type="button" className={tool === id ? "active" : ""} aria-pressed={tool === id}
              draggable={id === "DOOR" || id === "WINDOW"}
              onDragStart={(event) => event.dataTransfer.setData("application/odan-opening", id)}
              onClick={() => chooseTool(id)}><span aria-hidden="true">{icon}</span>{label}</button>)}
          {tool === "WALL" && <label>Direction <select value={axisLock} onChange={(event) => setAxisLock(event.target.value as typeof axisLock)}>
            <option value="FREE">Free angle</option><option value="HORIZONTAL">Horizontal</option><option value="VERTICAL">Vertical</option></select></label>}
          <p>{tool === "WALL" ? "Drag from start to end. Grid snaps to 0.25 m; nearby wall endpoints snap automatically. Exact length is entered next." :
            tool === "DOOR" || tool === "WINDOW" ? "Drag onto a wall in Top View, or select this tool and click a wall. Opening distance is measured from the wall start to its near edge." :
            tool === "PAN" ? "Drag to pan Top View. Orbit, zoom and pan directly in 3D View." : "Select a wall or opening to edit it."}</p>
        </aside>
        <div className="panel designer-canvas"><div className="designer-canvas-heading"><strong>{view === "TOP" ? "Ground floor · Top View" : "Ground floor · 3D View"}</strong>
          <span>{model.status}{dirty ? " · Unsaved changes" : ""}</span></div>
          {view === "TOP" ? <DesignerTopCanvas walls={walls} selectedId={selectedId} tool={tool} axisLock={axisLock}
            fitSignal={fitSignal} focusPoint={focusPoint} focusSignal={focusSignal} highlightedWallIds={highlightedWallIds}
            onDraw={draw} onMove={moveWall} onPickWall={pickWall} onPickOpening={setSelectedId} /> :
            <Designer3D walls={walls} junctions={junctions} selectedId={selectedId}
              fitSignal={fitSignal} tool={tool} axisLock={axisLock} onDraw={draw} onMove={moveWall}
              highlightedWallIds={highlightedWallIds} onSelect={(id) => {
                const wall = walls.find((item) => item.id === id);
                if (wall) pickWall(id); else setSelectedId(id);
              }} />}
          {!walls.length && <p className="designer-canvas-tip">Choose Wall and drag across the grid to create your first wall.</p>}
        </div>
        <aside className="panel designer-properties"><details open><summary>Properties</summary>
          <label>Model name<input value={name} maxLength={100} onChange={(event) => { change({ ...snapshot(), name: event.target.value }); }} /></label>
          <Scalar label="Floor height" value={floorHeightMeters} unit={units} onChange={(value) => change({ ...snapshot(), floorHeightMeters: value })} />
          {selectedWall ? <><h3>{selectedWall.label}</h3><p>Length {length(modelDistance({ x: selectedWall.startX, y: selectedWall.startY },
            { x: selectedWall.endX, y: selectedWall.endY }))}</p>
            <button onClick={() => { const wall = selectedWall;
              const path = alignPoints({ x: wall.startX, y: wall.startY }, { x: wall.endX, y: wall.endY },
                -offsetForAlignment(wall.alignment, wall.thicknessMeters));
              setWallDraft({ id: wall.id, start: path.start, end: path.end,
                label: wall.label, lengthMeters: modelDistance({ x: wall.startX, y: wall.startY }, { x: wall.endX, y: wall.endY }),
                heightMeters: wall.heightMeters, thicknessMeters: wall.thicknessMeters, alignment: wall.alignment,
                intents: { START: null, END: null } }); setPlaceUnconnected(false);
            }}>Edit wall dimensions</button>
            <p>Face A is left of the wall's start-to-end direction; Face B is right. <abbr title="Labels follow the direction from the wall start to end">ⓘ</abbr></p>
            <div className="designer-face-list">{selectedWall.faces.map((item) => <fieldset key={item.side}><legend>Face {item.side}</legend>
              <label>Room / side<input value={item.roomName ?? ""} maxLength={100} onChange={(event) => updateWall(selectedWall.id, (wall) => ({ ...wall,
                faces: wall.faces.map((f) => f.side === item.side ? { ...f, roomName: event.target.value || null } : f) as DesignerWall["faces"] }))} /></label>
              {(["plaster", "paint"] as const).map((kind) => <div key={kind}>
                <label className="designer-check-row"><input type="checkbox" checked={item[kind]} onChange={(event) => updateWall(selectedWall.id, (wall) => ({ ...wall,
                  faces: wall.faces.map((f) => f.side === item.side ? { ...f, [kind]: event.target.checked } : f) as DesignerWall["faces"] }))} /> {kind === "plaster" ? "Plastering" : "Painting"}</label>
                {item[kind] && <Scalar label={`${kind} height`} value={item[`${kind}HeightMeters`] ?? selectedWall.heightMeters} unit={units}
                  onChange={(value) => updateWall(selectedWall.id, (wall) => ({ ...wall,
                    faces: wall.faces.map((f) => f.side === item.side ? { ...f, [`${kind}HeightMeters`]: value } : f) as DesignerWall["faces"] }))} />}
              </div>)}</fieldset>)}</div>
            <div className="designer-section-heading"><h4>Hosted openings</h4><div className="designer-opening-actions">
              <button onClick={() => pickWall(selectedWall.id, undefined, "DOOR")}>Add door</button>
              <button onClick={() => pickWall(selectedWall.id, undefined, "WINDOW")}>Add window</button></div></div>
            {selectedWall.openings.length ? selectedWall.openings.map((opening) => <div key={opening.id} className="designer-opening-row">
              <div><strong>{opening.label}</strong><span>{opening.type.toLowerCase()} · {length(opening.widthMeters)} × {length(opening.heightMeters)} · at {length(opening.positionMeters)}</span></div>
              <button aria-label={`Edit ${opening.label}`} onClick={() => { setSelectedId(opening.id);
                setOpeningDraft({ ...opening, wallId: selectedWall.id, existing: true }); }}>Edit</button>
              <button className="danger" aria-label={`Delete ${opening.label}`} onClick={() => { setSelectedId(opening.id); setDeleteOpening(opening); }}>Delete</button>
            </div>) : <p>No hosted openings.</p>}
            <fieldset className="designer-connections"><legend>Connections</legend>
              {selectedConnections.length ? selectedConnections.map((item) => {
                const adjoining = walls.find((wall) => wall.id === item.adjoiningWallId);
                const continuous = walls.find((wall) => wall.id === item.continuousWallId);
                const location = adjoining && { x: item.adjoiningEnd === "START" ? adjoining.startX : adjoining.endX,
                  y: item.adjoiningEnd === "START" ? adjoining.startY : adjoining.endY };
                return <div key={item.id} className="designer-connection-row"><span>Connected to {selectedWall.id === item.adjoiningWallId ? continuous?.label : adjoining?.label} · {item.adjoiningEnd.toLowerCase()} {selectedWall.id === item.continuousWallId ? "(through wall)" : ""}</span>
                  <button onClick={() => { setView("TOP"); setHighlightedWallIds([item.adjoiningWallId, item.continuousWallId]);
                    setFocusPoint(location ?? null); setFocusSignal((value) => value + 1); }}>Show</button>
                  <button onClick={() => { change({ ...snapshot(), junctions: junctions.filter((value) => value.id !== item.id) });
                    setHighlightedWallIds([]); }} aria-label={`Disconnect ${selectedWall.label} from ${continuous?.label}`}>Disconnect</button></div>;
              }) : <p>No connections. Drag a wall endpoint onto another wall to join.</p>}
              {quantity?.issues.filter((issue) => issue.includes(selectedWall.label) && (issue.includes("Junction") || issue.includes("meet")))
                .map((issue) => <p className="plan-warning" key={issue}>{issue} Edit or reconnect this wall.</p>)}
              {walls.length > 1 && <details className="designer-advanced"><summary>Advanced connections</summary>
                <p>Manual square corner and T-junction control. The adjoining wall trims to the continuous wall.</p>
                <label>Continuous wall<select value={continuousWallId} onChange={(event) => setContinuousWallId(event.target.value)}>
                <option value="">Choose wall</option>{walls.filter((wall) => wall.id !== selectedWall.id).map((wall) =>
                  <option key={wall.id} value={wall.id}>{wall.label}</option>)}</select></label>
                <label>Selected wall endpoint<select value={adjoiningEnd} onChange={(event) => setAdjoiningEnd(event.target.value as typeof adjoiningEnd)}>
                <option value="START">Start</option><option value="END">End</option></select></label>
                <button disabled={!continuousWallId} onClick={() => {
                const next = [...junctions.filter((item) => !(item.adjoiningWallId === selectedWall.id && item.adjoiningEnd === adjoiningEnd)),
                  { id: makeId(), continuousWallId, adjoiningWallId: selectedWall.id, adjoiningEnd }];
                try { if (createsTrimCycle(next)) throw new Error("This join would create cyclic trimming.");
                  const validation = calculateDesignerQuantities(walls, next);
                  if (validation.issues.some((issue) => issue.includes("Junction between"))) throw new Error("Only square corner or T-junctions can be connected.");
                  change({ ...snapshot(), junctions: next }); }
                catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid junction"); }
                }}>Connect</button></details>}
            </fieldset>
            <button className="danger" onClick={() => setDeleteWall(selectedWall)}>Delete wall</button>
          </> : <p>Select a wall to edit its dimensions and Face A / Face B finishes.</p>}
        </details></aside>
      </div>
      <details className="panel designer-quantities" open><summary>Quantity summary {dirty ? "· Live preview (unsaved)" : "· Saved"}</summary>
        <details className="designer-quantity-help"><summary>Calculation breakdown and conventions</summary>
          <p>Centreline wall lengths; adjoining butt-joint walls trim to the continuous wall face. Reveals are excluded from finishes.</p>
          {quantity?.walls.map((item) => <details key={item.id} className="designer-wall-quantity"><summary>{item.label} · {area(item.netMasonryArea)} · {volume(item.masonryVolume)}</summary>
            <p>Gross {area(item.grossArea)} · Openings −{area(item.openingDeduction)} · Junctions −{area(item.junctionDeduction)}</p>
            {item.faces.map((side) => <p key={side.side}>Face {side.side}{side.roomName ? ` (${side.roomName})` : ""}: plaster {area(side.plaster.netArea)}, paint {area(side.paint.netArea)}</p>)}
          </details>)}
        </details>
        {quantityError && <p className="error" role="alert">{quantityError}</p>}
        {quantity?.issues.map((issue) => <p className="plan-warning" key={issue}>{issue} Totals are provisional; review is unavailable.</p>)}
        <div className="designer-totals">
          <span>Gross brickwork <strong>{area(quantity?.totals.grossArea ?? 0)}</strong></span>
          <span>Openings <strong>−{area(quantity?.totals.openingDeduction ?? 0)}</strong></span>
          <span>Junctions <strong>−{area(quantity?.totals.junctionDeduction ?? 0)}</strong></span>
          <span>Net brickwork <strong>{area(quantity?.totals.netMasonryArea ?? 0)}</strong></span>
          <span>Net volume <strong>{volume(quantity?.totals.masonryVolume ?? 0)}</strong></span>
          <span>Plaster <strong>{area(quantity?.totals.plasterArea ?? 0)}</strong></span>
          <span>Paint <strong>{area(quantity?.totals.paintArea ?? 0)}</strong></span>
          <span>Walls / doors / windows <strong>{quantity?.totals.walls ?? 0} / {quantity?.totals.doors ?? 0} / {quantity?.totals.windows ?? 0}</strong></span>
        </div>
        <button disabled={dirty || saving || !walls.length || Boolean(quantity?.issues.length)} onClick={() => void review()}>Mark Reviewed</button>
      </details>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    {wallDraft && <EditorDialog title={wallDraft.id ? "Edit wall" : "Create wall"} error={dialogError}
      submitLabel={wallDraft.id ? "Apply changes" : "Add wall"} onCancel={cancelDraft} onSubmit={commitWall}>
      <label>Name<input required maxLength={100} value={wallDraft.label} onChange={(event) => setWallDraft({ ...wallDraft, label: event.target.value })} /></label>
      <Scalar label="Exact length" value={wallDraft.lengthMeters} unit={units} onChange={(value) => setWallDraft({ ...wallDraft, lengthMeters: value })} />
      <Scalar label="Height" value={wallDraft.heightMeters} unit={units} onChange={(value) => setWallDraft({ ...wallDraft, heightMeters: value })} />
      <Scalar label="Thickness" value={wallDraft.thicknessMeters} unit={units} onChange={(value) => setWallDraft({ ...wallDraft, thicknessMeters: value })} />
      <div className="designer-position-grid"><SignedPosition label="Start X" metres={wallDraft.start.x} unit={units}
        onChange={(value) => setWallDraft({ ...wallDraft, start: { ...wallDraft.start, x: value },
          end: { ...wallDraft.end, x: wallDraft.end.x + value - wallDraft.start.x } })} />
        <SignedPosition label="Start Y" metres={wallDraft.start.y} unit={units}
          onChange={(value) => setWallDraft({ ...wallDraft, start: { ...wallDraft.start, y: value },
            end: { ...wallDraft.end, y: wallDraft.end.y + value - wallDraft.start.y } })} /></div>
      <label>Alignment<select value={wallDraft.alignment} onChange={(event) => setWallDraft({ ...wallDraft, alignment: event.target.value as DesignerWall["alignment"] })}>
        <option value="CENTRELINE">Centreline</option><option value="INSIDE">Inside face</option><option value="OUTSIDE">Outside face</option></select></label>
      <p>Length follows the drawn direction. Alignment places the stored centreline relative to your drawn line.</p>
      {(wallDraft.intents.START || wallDraft.intents.END) && <fieldset className="designer-join-preview"><legend>Connection preview</legend>
        {(["START", "END"] as const).map((end) => {
          const intent = wallDraft.intents[end]; if (!intent) return null;
          const rawLength = modelDistance(wallDraft.start, wallDraft.end);
          if (!rawLength) return null;
          const rawEnd = { x: wallDraft.start.x + (wallDraft.end.x - wallDraft.start.x) / rawLength * wallDraft.lengthMeters,
            y: wallDraft.start.y + (wallDraft.end.y - wallDraft.start.y) / rawLength * wallDraft.lengthMeters };
          const aligned = alignPoints(wallDraft.start, rawEnd, offsetForAlignment(wallDraft.alignment, wallDraft.thicknessMeters));
          const wall = { id: wallDraft.id ?? "draft", startX: aligned.start.x, startY: aligned.start.y,
            endX: aligned.end.x, endY: aligned.end.y } as DesignerWall;
          const status = connectionTarget(wall, end, intent, walls.filter((item) => item.id !== wallDraft.id));
          return <div key={end} className="designer-join-choice"><strong>{end === "START" ? "Start" : "End"} endpoint</strong>
            {intent.candidates.length > 1 && <label>Target wall<select value={intent.chosenWallId ?? ""} onChange={(event) => {
              setWallDraft({ ...wallDraft, intents: { ...wallDraft.intents,
                [end]: { ...intent, chosenWallId: event.target.value || null } } }); setDialogError(""); }}>
              <option value="">Choose wall</option>{intent.candidates.map((candidate) => <option key={candidate.wallId} value={candidate.wallId}>
                {walls.find((item) => item.id === candidate.wallId)?.label ?? candidate.wallId}</option>)}</select></label>}
            <p className={status.warning ? "plan-warning" : ""}>{status.warning ??
              `Join to ${walls.find((item) => item.id === status.candidate?.wallId)?.label} · ${status.candidate?.kind === "T" ? "through-wall T" : "square corner"} · trim adjoining wall ${length((walls.find((item) => item.id === status.candidate?.wallId)?.thicknessMeters ?? 0) / 2)}`}</p>
          </div>;
        })}
        <label className="designer-check-row"><input type="checkbox" checked={placeUnconnected}
          onChange={(event) => { setPlaceUnconnected(event.target.checked); setDialogError(""); }} /> Place without a new join</label>
      </fieldset>}
    </EditorDialog>}
    {openingDraft && <EditorDialog title={openingDraft.existing ? `Edit ${openingDraft.type.toLowerCase()}` : `Place ${openingDraft.type.toLowerCase()}`}
      error={dialogError} submitLabel={openingDraft.existing ? "Apply changes" : "Add opening"} onCancel={cancelDraft} onSubmit={commitOpening}>
      <label>Name<input required maxLength={100} value={openingDraft.label} onChange={(event) => setOpeningDraft({ ...openingDraft, label: event.target.value })} /></label>
      <Scalar label="Width" value={openingDraft.widthMeters} unit={units} onChange={(value) => setOpeningDraft({ ...openingDraft, widthMeters: value })} />
      <Scalar label="Height" value={openingDraft.heightMeters} unit={units} onChange={(value) => setOpeningDraft({ ...openingDraft, heightMeters: value })} />
      {openingDraft.type === "WINDOW" && <Scalar label="Sill above floor" value={openingDraft.sillMeters} unit={units}
        onChange={(value) => setOpeningDraft({ ...openingDraft, sillMeters: value })} />}
      <Scalar label="Distance from wall start to near edge" value={openingDraft.positionMeters} unit={units}
        onChange={(value) => setOpeningDraft({ ...openingDraft, positionMeters: value })} />
      <p>The distance is from the host wall's start endpoint to the opening's near edge.</p>
    </EditorDialog>}
    {deleteWall && <ConfirmDialog title="Delete wall?" message={`Delete ${deleteWall.label} and its ${deleteWall.openings.length} hosted opening(s)? The change is not stored until Save.`}
      confirmLabel="Delete wall" onCancel={() => setDeleteWall(null)} onConfirm={() => {
        change({ ...snapshot(), walls: walls.filter((item) => item.id !== deleteWall.id),
          junctions: junctions.filter((item) => item.continuousWallId !== deleteWall.id && item.adjoiningWallId !== deleteWall.id) });
        setSelectedId(null); setDeleteWall(null);
      }} />}
    {deleteOpening && selectedWall && <ConfirmDialog title="Delete opening?" message={`Delete ${deleteOpening.label} from ${selectedWall.label}? The change is not stored until Save.`}
      confirmLabel="Delete opening" onCancel={() => setDeleteOpening(null)} onConfirm={() => {
        updateWall(selectedWall.id, (wall) => ({ ...wall,
          openings: wall.openings.filter((item) => item.id !== deleteOpening.id) }));
        setSelectedId(selectedWall.id); setDeleteOpening(null);
      }} />}
    {(guardTool || blocker.state === "blocked") && <div className="modal-backdrop"><section className="modal-card modal-card-small plan-management-dialog" role="dialog" aria-modal="true" aria-label="Unsaved designer work">
      <h2>Unsaved designer work</h2><p>Save, discard, or stay before leaving.</p>
      <div className="modal-actions"><button onClick={() => { setGuardTool(null); if (blocker.state === "blocked") blocker.reset(); }}>Stay</button>
        <button onClick={() => { cancelDraft(); if (guardTool) { setTool(guardTool); setGuardTool(null); }
          else if (blocker.state === "blocked") blocker.proceed(); }}>Discard</button>
        <button className="primary" disabled={hasDraft || saving || !dirty} onClick={() => void save().then((saved) => {
          if (saved) { setGuardTool(null); if (blocker.state === "blocked") blocker.proceed(); }
        })}>Save</button></div>
    </section></div>}
  </section>;
}
