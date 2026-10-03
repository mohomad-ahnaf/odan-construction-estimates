import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { DesignerJunction, DesignerWall, PlanPoint } from "../types";
import { modelDistance, wallSolidBands } from "../lib/designerGeometry";
import { findWallSnap, type EndIntents, type SnapIntent } from "../lib/designerConnections";
import type { DesignerTool } from "./DesignerTopCanvas";

export function Designer3D({ walls, junctions, selectedId, onSelect, fitSignal, tool = "PAN", axisLock = "FREE",
  onDraw, onMove, highlightedWallIds = [] }: {
  walls: DesignerWall[];
  junctions: DesignerJunction[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fitSignal: number;
  tool?: DesignerTool;
  axisLock?: "FREE" | "HORIZONTAL" | "VERTICAL";
  onDraw?: (start: PlanPoint, end: PlanPoint, intents: EndIntents) => void;
  onMove?: (wallId: string, start: PlanPoint, end: PlanPoint, intents: EndIntents) => void;
  highlightedWallIds?: string[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const onDrawRef = useRef(onDraw);
  const onMoveRef = useRef(onMove);
  const cameraState = useRef<{ position: THREE.Vector3; target: THREE.Vector3; fitSignal: number } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [snapMessage, setSnapMessage] = useState("");
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onDrawRef.current = onDraw; onMoveRef.current = onMove; }, [onDraw, onMove]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setFallback(true); return; }
    setFallback(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f8f7f2");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.5;
    controls.enabled = tool === "PAN";
    const ambient = new THREE.HemisphereLight(0xffffff, 0xb1a895, 2.1);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(10, 20, 8);
    scene.add(sun);
    const grid = new THREE.GridHelper(40, 40, 0xc5b9a0, 0xe4e0d8);
    grid.position.y = -0.005;
    scene.add(grid);
    const meshes: THREE.Mesh[] = [];
    for (const wall of walls) {
      const dx = wall.endX - wall.startX;
      const dz = wall.endY - wall.startY;
      const length = Math.hypot(dx, dz);
      if (!(length > 0)) continue;
      const angle = -Math.atan2(dz, dx);
      const trimStart = junctions.filter((item) => item.adjoiningWallId === wall.id && item.adjoiningEnd === "START")
        .reduce((sum, item) => sum + (walls.find((candidate) => candidate.id === item.continuousWallId)?.thicknessMeters ?? 0) / 2, 0);
      const trimEnd = junctions.filter((item) => item.adjoiningWallId === wall.id && item.adjoiningEnd === "END")
        .reduce((sum, item) => sum + (walls.find((candidate) => candidate.id === item.continuousWallId)?.thicknessMeters ?? 0) / 2, 0);
      for (const { start, end, bottom, top } of wallSolidBands(wall, trimStart, trimEnd)) {
          const geometry = new THREE.BoxGeometry(end - start, top! - bottom!, wall.thicknessMeters);
          const material = new THREE.MeshStandardMaterial({
            color: wall.id === selectedId || highlightedWallIds.includes(wall.id) ? 0xc8a34d : 0x0b2a47,
            roughness: 0.82,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(wall.startX + dx * (start + end) / (2 * length), (bottom! + top!) / 2,
            wall.startY + dz * (start + end) / (2 * length));
          mesh.rotation.y = angle;
          mesh.userData.elementId = wall.id;
          scene.add(mesh);
          meshes.push(mesh);
      }
      // wallSolidBands leaves real voids. No mesh fills a door or window opening.
    }
    const bounds = new THREE.Box3();
    if (meshes.length) meshes.forEach((mesh) => bounds.expandByObject(mesh));
    else bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(6, 3, 6));
    const fit = () => {
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const distance = Math.max(5, Math.max(size.x, size.z, size.y) * 2.1);
      camera.position.set(center.x + distance * 0.7, center.y + distance * 0.85, center.z + distance * 0.8);
      controls.target.copy(center);
      controls.update();
    };
    if (cameraState.current?.fitSignal === fitSignal) {
      camera.position.copy(cameraState.current.position);
      controls.target.copy(cameraState.current.target);
      controls.update();
    } else fit();
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const raycaster = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const rayAt = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    };
    const pointAt = (event: PointerEvent): PlanPoint | null => {
      rayAt(event);
      const hit = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
      return hit ? { x: hit.x, y: hit.z } : null;
    };
    const toScreen = (point: PlanPoint): PlanPoint => {
      const projected = new THREE.Vector3(point.x, 0, point.y).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + (projected.x + 1) * rect.width / 2,
        y: rect.top + (1 - projected.y) * rect.height / 2 };
    };
    const snapped = (point: PlanPoint, event: PointerEvent, excludeWallId?: string,
      pointer: PlanPoint = { x: event.clientX, y: event.clientY }, anchor?: PlanPoint) => {
      const hit = findWallSnap(point, walls, toScreen, pointer, undefined, excludeWallId);
      const compatible = !anchor ||
        (axisLock !== "VERTICAL" || Math.abs((hit?.point.x ?? anchor.x) - anchor.x) < .001) &&
        (axisLock !== "HORIZONTAL" || Math.abs((hit?.point.y ?? anchor.y) - anchor.y) < .001);
      return { point: hit && compatible ? hit.point : point, intent: compatible ? hit : null };
    };
    type Drag = { kind: "DRAW"; start: PlanPoint; intent: SnapIntent | null } |
      { kind: "MOVE"; wallId: string; pointer: PlanPoint; start: PlanPoint; end: PlanPoint };
    let drag: Drag | null = null;
    const activeTouches = new Set<number>();
    let touchGesture = false;
    let touchStart: { x: number; y: number } | null = null;
    let touchWallStart: { start: PlanPoint; intent: SnapIntent | null } | null = null;
    let preview: THREE.Line | null = null;
    let snapMarker: THREE.Mesh | null = null;
    const clearPreview = () => {
      if (preview) { scene.remove(preview); preview.geometry.dispose();
        (preview.material as THREE.Material).dispose(); preview = null; }
      if (snapMarker) { scene.remove(snapMarker); snapMarker.geometry.dispose();
        (snapMarker.material as THREE.Material).dispose(); snapMarker = null; }
      for (const mesh of meshes) (mesh.material as THREE.MeshStandardMaterial).color.setHex(
        mesh.userData.elementId === selectedId || highlightedWallIds.includes(mesh.userData.elementId as string) ? 0xc8a34d : 0x0b2a47);
      setSnapMessage("");
    };
    const showPreview = (start: PlanPoint, end: PlanPoint, intent: SnapIntent | null) => {
      clearPreview();
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(start.x, .08, start.y), new THREE.Vector3(end.x, .08, end.y)]);
      preview = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xd1a448, linewidth: 2 }));
      scene.add(preview);
      if (intent) {
        const target = walls.find((wall) => wall.id === intent.candidates[0]?.wallId);
        for (const mesh of meshes) if (mesh.userData.elementId === target?.id)
          (mesh.material as THREE.MeshStandardMaterial).color.setHex(0xe0a92b);
        snapMarker = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0xe0a92b }));
        snapMarker.position.set(intent.point.x, .12, intent.point.y);
        scene.add(snapMarker);
        const dx = end.x - start.x, dy = end.y - start.y;
        const tx = target ? target.endX - target.startX : 0, ty = target ? target.endY - target.startY : 0;
        const cosine = Math.abs((dx * tx + dy * ty) / (Math.hypot(dx, dy) * Math.hypot(tx, ty)));
        setSnapMessage(intent.candidates.length > 1 ? "Several walls nearby — choose target in wall details" :
          cosine > .02 ? `Unsupported angle at ${target?.label} — no automatic join` :
            `Join to ${target?.label} · trim ${(target?.thicknessMeters ?? 0) / 2} m`);
      }
    };
    const movingAt = (active: Extract<Drag, { kind: "MOVE" }>, event: PointerEvent) => {
      const point = pointAt(event); if (!point) return null;
      const dx = point.x - active.pointer.x, dy = point.y - active.pointer.y;
      const start = { x: active.start.x + dx, y: active.start.y + dy };
      const end = { x: active.end.x + dx, y: active.end.y + dy };
      const startHit = snapped(start, event, active.wallId, toScreen(start));
      const endHit = findWallSnap(end, walls, toScreen, toScreen(end), undefined, active.wallId);
      const useStart = Boolean(startHit.intent && (!endHit || startHit.intent.candidates[0]!.distancePx <= endHit.candidates[0]!.distancePx));
      const hit = useStart ? startHit.intent : endHit;
      const target = useStart ? startHit.point : endHit?.point;
      const shift = hit && target ? { x: target.x - (useStart ? start.x : end.x), y: target.y - (useStart ? start.y : end.y) } : { x: 0, y: 0 };
      const nextStart = { x: start.x + shift.x, y: start.y + shift.y };
      const nextEnd = { x: end.x + shift.x, y: end.y + shift.y };
      const intents: EndIntents = { START: useStart ? hit : null, END: useStart ? null : hit };
      return { start: nextStart, end: nextEnd, intents, hit };
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        activeTouches.add(event.pointerId);
        if (activeTouches.size > 1) {
          touchGesture = true; drag = null; touchWallStart = null; clearPreview();
        }
        touchStart = { x: event.clientX, y: event.clientY };
        return;
      }
      if (tool !== "WALL" && tool !== "SELECT") return;
      const point = pointAt(event); if (!point) return;
      if (tool === "WALL") {
        const start = snapped(point, event);
        drag = { kind: "DRAW", start: start.point, intent: start.intent };
      } else {
        rayAt(event);
        const hit = raycaster.intersectObjects(meshes)[0];
        const id = hit?.object.userData.elementId as string | undefined;
        const wall = walls.find((item) => item.id === id);
        if (!wall) return;
        drag = { kind: "MOVE", wallId: wall.id, pointer: point,
          start: { x: wall.startX, y: wall.startY }, end: { x: wall.endX, y: wall.endY } };
      }
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const active = drag; if (!active) return;
      if (active.kind === "DRAW") {
        const point = pointAt(event); if (!point) return;
        const constrained = { x: axisLock === "VERTICAL" ? active.start.x : point.x,
          y: axisLock === "HORIZONTAL" ? active.start.y : point.y };
        const end = snapped(constrained, event, undefined, undefined, active.start);
        showPreview(active.start, end.point, end.intent);
      } else {
        const next = movingAt(active, event);
        if (next) showPreview(next.start, next.end, next.hit);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        activeTouches.delete(event.pointerId);
        if (touchGesture) {
          if (!activeTouches.size) touchGesture = false;
          touchStart = null; clearPreview(); return;
        }
        const moved = touchStart && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 8;
        touchStart = null;
        if (moved) return;
        if (tool === "WALL") {
          const point = pointAt(event); if (!point) return;
          const hit = snapped(point, event, undefined, undefined, touchWallStart?.start);
          if (!touchWallStart) {
            touchWallStart = { start: hit.point, intent: hit.intent };
            showPreview(hit.point, hit.point, null);
          } else {
            const start = touchWallStart;
            touchWallStart = null; clearPreview();
            if (modelDistance(start.start, hit.point) > .05)
              onDrawRef.current?.(start.start, hit.point, { START: start.intent, END: hit.intent });
          }
          return;
        }
        if (tool === "SELECT" || tool === "DOOR" || tool === "WINDOW") {
          rayAt(event); const hit = raycaster.intersectObjects(meshes)[0];
          if (hit?.object.userData.elementId) onSelectRef.current(hit.object.userData.elementId as string);
        }
        return;
      }
      const active = drag; drag = null; clearPreview();
      if (!active) {
        if (tool !== "SELECT" && tool !== "DOOR" && tool !== "WINDOW") return;
        rayAt(event); const hit = raycaster.intersectObjects(meshes)[0];
        if (hit?.object.userData.elementId) onSelectRef.current(hit.object.userData.elementId as string);
        return;
      }
      if (active.kind === "DRAW") {
        const point = pointAt(event); if (!point) return;
        const constrained = { x: axisLock === "VERTICAL" ? active.start.x : point.x,
          y: axisLock === "HORIZONTAL" ? active.start.y : point.y };
        const end = snapped(constrained, event, undefined, undefined, active.start);
        if (modelDistance(active.start, end.point) > .05)
          onDrawRef.current?.(active.start, end.point, { START: active.intent, END: end.intent });
      } else {
        const next = movingAt(active, event);
        if (next && modelDistance(active.start, next.start) > .03)
          onMoveRef.current?.(active.wallId, next.start, next.end, next.intents);
        else onSelectRef.current(active.wallId);
      }
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { drag = null; touchWallStart = null; clearPreview(); } };
    const onPointerCancel = (event: PointerEvent) => { activeTouches.delete(event.pointerId); drag = null; touchWallStart = null; clearPreview(); if (!activeTouches.size) touchGesture = false; };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onEscape);
    let frame = 0;
    let disposed = false;
    const animate = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      disposed = true;
      cameraState.current = { position: camera.position.clone(), target: controls.target.clone(), fitSignal };
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onEscape);
      clearPreview();
      controls.dispose();
      meshes.forEach((mesh) => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); });
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [walls, junctions, selectedId, fitSignal, tool, axisLock, highlightedWallIds]);

  return <div className="designer-preview" ref={hostRef} aria-label="Interactive 3D building model">
    {snapMessage && <p className="designer-3d-snap" role="status">{snapMessage}</p>}
    {fallback && <p role="status">3D preview is unavailable on this device. You can continue editing the 2D model.</p>}
  </div>;
}


