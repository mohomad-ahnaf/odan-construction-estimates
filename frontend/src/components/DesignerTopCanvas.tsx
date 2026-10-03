import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";
import type { DesignerWall, PlanPoint } from "../types";
import { modelDistance, projectToWall, wallPointAt } from "../lib/designerGeometry";
import { findWallSnap, type EndIntents, type SnapIntent } from "../lib/designerConnections";

export type DesignerTool = "SELECT" | "WALL" | "DOOR" | "WINDOW" | "PAN";
const GRID = 0.25;
export function DesignerTopCanvas({ walls, selectedId, highlightedWallIds = [], focusPoint, focusSignal,
  tool, axisLock, fitSignal, onDraw, onMove, onPickWall, onPickOpening }: {
  walls: DesignerWall[]; selectedId: string | null; tool: DesignerTool;
  highlightedWallIds?: string[]; focusPoint?: PlanPoint | null; focusSignal?: number;
  axisLock: "FREE" | "HORIZONTAL" | "VERTICAL"; fitSignal: number;
  onDraw: (start: PlanPoint, end: PlanPoint, intents: EndIntents) => void;
  onMove?: (wallId: string, start: PlanPoint, end: PlanPoint, intents: EndIntents) => void;
  onPickWall: (id: string, point: PlanPoint, openingType?: "DOOR" | "WINDOW") => void;
  onPickOpening: (id: string) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: -10, y: -7, width: 20, height: 14 });
  const [preview, setPreview] = useState<{ start: PlanPoint; end: PlanPoint; intents: EndIntents } | null>(null);
  const drawing = useRef<{ start: PlanPoint; intent: SnapIntent | null } | null>(null);
  const moving = useRef<{ wallId: string; pointer: PlanPoint; start: PlanPoint; end: PlanPoint } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ wallId: string; position: number; type: "DOOR" | "WINDOW" } | null>(null);
  const pan = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null);
  useEffect(() => {
    if (!walls.length) { setView({ x: -10, y: -7, width: 20, height: 14 }); return; }
    const xs = walls.flatMap((wall) => [wall.startX, wall.endX]);
    const ys = walls.flatMap((wall) => [wall.startY, wall.endY]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = Math.max(8, maxX - minX + 5), height = Math.max(6, maxY - minY + 5);
    setView({ x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height });
  }, [fitSignal]);
  useEffect(() => {
    if (!focusPoint) return;
    setView({ x: focusPoint.x - 3.5, y: focusPoint.y - 2.5, width: 7, height: 5 });
  }, [focusSignal]);
  function point(event: { clientX: number; clientY: number }): PlanPoint {
    const root = svg.current!;
    const client = root.createSVGPoint(); client.x = event.clientX; client.y = event.clientY;
    const model = client.matrixTransform(root.getScreenCTM()!.inverse());
    return { x: model.x, y: model.y };
  }
  function toScreen(p: PlanPoint): PlanPoint {
    const root = svg.current!;
    const value = root.createSVGPoint(); value.x = p.x; value.y = p.y;
    const screen = value.matrixTransform(root.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  }
  function snapped(raw: PlanPoint, anchor: PlanPoint | null, excludeWallId?: string) {
    const constrained = anchor ? { x: axisLock === "VERTICAL" ? anchor.x : raw.x,
      y: axisLock === "HORIZONTAL" ? anchor.y : raw.y } : raw;
    const compatible = (p: PlanPoint) => !anchor ||
      (axisLock !== "VERTICAL" || Math.abs(p.x - anchor.x) < .001) &&
      (axisLock !== "HORIZONTAL" || Math.abs(p.y - anchor.y) < .001);
    const hit = findWallSnap(constrained, walls, toScreen, toScreen(constrained), undefined, excludeWallId);
    if (hit && compatible(hit.point)) return { point: hit.point, intent: hit };
    return { point: { x: axisLock === "VERTICAL" && anchor ? anchor.x : Math.round(constrained.x / GRID) * GRID,
      y: axisLock === "HORIZONTAL" && anchor ? anchor.y : Math.round(constrained.y / GRID) * GRID },
      intent: null };
  }
  function moveAt(raw: PlanPoint) {
    const active = moving.current!;
    const dx = raw.x - active.pointer.x, dy = raw.y - active.pointer.y;
    const startRaw = { x: active.start.x + dx, y: active.start.y + dy };
    const endRaw = { x: active.end.x + dx, y: active.end.y + dy };
    const startSnap = snapped(startRaw, null, active.wallId);
    const endSnap = snapped(endRaw, null, active.wallId);
    const useStart = Boolean(startSnap.intent && (!endSnap.intent ||
      startSnap.intent.candidates[0]!.distancePx <= endSnap.intent.candidates[0]!.distancePx));
    const primary = useStart ? startSnap : endSnap;
    const shift = primary.intent ? { x: primary.point.x - (useStart ? startRaw.x : endRaw.x),
      y: primary.point.y - (useStart ? startRaw.y : endRaw.y) } :
      { x: startSnap.point.x - startRaw.x, y: startSnap.point.y - startRaw.y };
    const start = { x: startRaw.x + shift.x, y: startRaw.y + shift.y };
    const end = { x: endRaw.x + shift.x, y: endRaw.y + shift.y };
    const other = findWallSnap(useStart ? end : start, walls, toScreen, toScreen(useStart ? end : start),
      undefined, active.wallId);
    const intents: EndIntents = {
      START: useStart ? startSnap.intent : other && modelDistance(start, other.point) < .001 ? other : null,
      END: useStart ? other && modelDistance(end, other.point) < .001 ? other : null : endSnap.intent,
    };
    return { start, end, intents };
  }
  function cancelPointer() {
    drawing.current = null; moving.current = null; pan.current = null; setPreview(null);
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") cancelPointer(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (tool === "PAN") {
      pan.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (tool === "WALL") {
      const start = snapped(point(event), null);
      drawing.current = { start: start.point, intent: start.intent };
      setPreview({ start: start.point, end: start.point, intents: { START: start.intent, END: null } });
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (tool === "SELECT" && onMove) {
      const wallId = (event.target as Element).getAttribute("data-wall-id");
      const wall = walls.find((item) => item.id === wallId);
      if (wall) {
        moving.current = { wallId: wall.id, pointer: point(event),
          start: { x: wall.startX, y: wall.startY }, end: { x: wall.endX, y: wall.endY } };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (pan.current) {
      const rect = svg.current!.getBoundingClientRect();
      setView((old) => ({ ...old, x: pan.current!.viewX - (event.clientX - pan.current!.x) / rect.width * old.width,
        y: pan.current!.viewY - (event.clientY - pan.current!.y) / rect.height * old.height }));
    } else if (drawing.current) {
      const end = snapped(point(event), drawing.current.start);
      setPreview({ start: drawing.current.start, end: end.point,
        intents: { START: drawing.current.intent, END: end.intent } });
    } else if (moving.current) setPreview(moveAt(point(event)));
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    if (pan.current) { pan.current = null; return; }
    if (drawing.current) {
      const start = drawing.current.start;
      const end = snapped(point(event), start);
      if (modelDistance(start, end.point) > .05)
        onDraw(start, end.point, { START: drawing.current.intent, END: end.intent });
    } else if (moving.current && onMove) {
      const active = moving.current, next = moveAt(point(event));
      if (modelDistance(active.start, next.start) > .03) onMove(active.wallId, next.start, next.end, next.intents);
      else onPickWall(active.wallId, point(event));
    }
    cancelPointer();
  }
  function nearestWall(p: PlanPoint) {
    const nearest = walls.map((wall) => {
      const projected = wallPointAt(wall, projectToWall(wall, p));
      return { wall, distance: modelDistance(p, projected) };
    }).sort((a, b) => a.distance - b.distance)[0];
    return nearest && nearest.distance < 0.45 ? nearest.wall : null;
  }
  function dragOver(event: DragEvent<SVGSVGElement>) {
    event.preventDefault();
    const p = point(event), wall = nearestWall(p);
    const kind = event.dataTransfer.types.includes("application/odan-opening") ? "DOOR" : null;
    setDropTarget(wall && kind ? { wallId: wall.id, position: projectToWall(wall, p), type: kind } : null);
  }
  function drop(event: DragEvent<SVGSVGElement>) {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/odan-opening");
    const p = point(event), wall = nearestWall(p);
    setDropTarget(null);
    if (wall && (kind === "DOOR" || kind === "WINDOW")) onPickWall(wall.id, p, kind);
  }
  const previewTargets = [preview?.intents.START, preview?.intents.END].flatMap((intent) => intent?.candidates ?? []);
  const previewMessage = (() => {
    if (!preview || modelDistance(preview.start, preview.end) < .05) return "";
    for (const end of ["START", "END"] as const) {
      const candidates = preview.intents[end]?.candidates ?? [];
      if (!candidates.length) continue;
      if (candidates.length > 1) return "Several walls nearby — choose a connection target";
      const wall = walls.find((item) => item.id === candidates[0]!.wallId)!;
      const dx = preview.end.x - preview.start.x, dy = preview.end.y - preview.start.y;
      const tx = wall.endX - wall.startX, ty = wall.endY - wall.startY;
      const cosine = Math.abs((dx * tx + dy * ty) / (Math.hypot(dx, dy) * Math.hypot(tx, ty)));
      if (cosine > .02) return `Unsupported angle at ${wall.label} — no automatic join`;
      return `Join to ${wall.label} · trim ${wall.thicknessMeters / 2} m`;
    }
    return "";
  })();
  return <svg ref={svg} className="designer-top" role="img" aria-label="Top view building canvas"
    viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} preserveAspectRatio="xMidYMid meet"
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
    onPointerCancel={cancelPointer}
    onDragOver={dragOver} onDragLeave={() => setDropTarget(null)} onDrop={drop}>
    <defs><pattern id="designer-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
      <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e6e1d7" strokeWidth=".008" /></pattern></defs>
    <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="#faf9f5" />
    <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="url(#designer-grid)" />
    {walls.map((wall) => <g key={wall.id}>
      <line x1={wall.startX} y1={wall.startY} x2={wall.endX} y2={wall.endY}
        stroke={selectedId === wall.id || highlightedWallIds.includes(wall.id) ||
          previewTargets.some((target) => target.wallId === wall.id) || dropTarget?.wallId === wall.id ? "#c89f45" : "#092541"}
        strokeWidth={wall.thicknessMeters}
        strokeLinecap="square" />
      <line data-wall-id={wall.id} x1={wall.startX} y1={wall.startY} x2={wall.endX} y2={wall.endY}
        stroke="transparent" strokeWidth=".48" onClick={(event) => {
          event.stopPropagation();
          if (tool !== "WALL" && tool !== "PAN") onPickWall(wall.id, point(event), tool === "DOOR" || tool === "WINDOW" ? tool : undefined);
        }} />
      {wall.openings.map((opening) => {
        const a = wallPointAt(wall, opening.positionMeters), b = wallPointAt(wall, opening.positionMeters + opening.widthMeters);
        return <line key={opening.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke={opening.type === "DOOR" ? "#f3c872" : "#78b7d0"} strokeWidth={wall.thicknessMeters + .025}
          onClick={(event) => { event.stopPropagation(); onPickOpening(opening.id); }} />;
      })}
      <text x={(wall.startX + wall.endX) / 2} y={(wall.startY + wall.endY) / 2 - .25}
        fontSize=".23" fill="#092541" textAnchor="middle" pointerEvents="none">{wall.label}</text>
      {selectedId === wall.id && <text x={(wall.startX + wall.endX) / 2} y={(wall.startY + wall.endY) / 2 + .34}
        fontSize=".2" fill="#845e12" textAnchor="middle" pointerEvents="none">
        {modelDistance({ x: wall.startX, y: wall.startY }, { x: wall.endX, y: wall.endY }).toFixed(3)} m
      </text>}
      {selectedId === wall.id && (["A", "B"] as const).map((side) => {
        const dx = wall.endX - wall.startX, dy = wall.endY - wall.startY, distance = Math.hypot(dx, dy);
        const offset = side === "A" ? -.62 : .62;
        return <text key={side} x={(wall.startX + wall.endX) / 2 - dy / distance * offset}
          y={(wall.startY + wall.endY) / 2 + dx / distance * offset}
          fontSize=".22" fill="#a57614" textAnchor="middle" pointerEvents="none">Face {side}</text>;
      })}
    </g>)}
    {preview && <line x1={preview.start.x} y1={preview.start.y} x2={preview.end.x} y2={preview.end.y}
      stroke="#c89f45" strokeWidth=".18" strokeDasharray=".12 .08" pointerEvents="none" />}
    {preview && [preview.intents.START, preview.intents.END].map((intent, index) => intent &&
      <circle key={index} cx={index ? preview.end.x : preview.start.x} cy={index ? preview.end.y : preview.start.y}
        r=".16" fill="#d5a94e" stroke="#071a2f" strokeWidth=".03" pointerEvents="none" />)}
    {previewMessage && <g pointerEvents="none"><rect x={view.x + .25} y={view.y + .25} width={Math.min(view.width - .5, 8)} height=".48"
      fill="#fff8e8" stroke="#d5a94e" strokeWidth=".018" rx=".1" />
      <text x={view.x + .42} y={view.y + .57} fill="#795414" fontSize=".22">{previewMessage}</text></g>}
    {dropTarget && (() => { const wall = walls.find((item) => item.id === dropTarget.wallId)!;
      const a = wallPointAt(wall, dropTarget.position), b = wallPointAt(wall, Math.min(dropTarget.position + 1,
        modelDistance({ x: wall.startX, y: wall.startY }, { x: wall.endX, y: wall.endY })));
      return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c89f45"
        strokeWidth={wall.thicknessMeters + .05} strokeDasharray=".1 .07" pointerEvents="none" />;
    })()}
  </svg>;
}
