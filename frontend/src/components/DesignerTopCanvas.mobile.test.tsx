import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DesignerTopCanvas } from "./DesignerTopCanvas";

it("draws a wall with two deliberate taps and ignores a two-finger gesture", () => {
  const onDraw = vi.fn();
  const { container } = render(<DesignerTopCanvas walls={[]} selectedId={null} tool="WALL" axisLock="FREE"
    fitSignal={0} onDraw={onDraw} onPickWall={vi.fn()} onPickOpening={vi.fn()} />);
  const svg = container.querySelector("svg")!;
  Object.defineProperty(svg, "createSVGPoint", { configurable: true, value: () => ({
    x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; },
  }) });
  Object.defineProperty(svg, "getScreenCTM", { configurable: true, value: () => ({ inverse: () => ({}) }) });
  const pointer = (type: string, id: number, x: number, y: number) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: "touch" },
      clientX: { value: x }, clientY: { value: y } });
    fireEvent(svg, event);
  };
  const tap = (id: number, x: number, y: number) => {
    pointer("pointerdown", id, x, y);
    pointer("pointerup", id, x, y);
  };
  pointer("pointerdown", 1, 0, 0);
  pointer("pointerdown", 2, 10, 0);
  pointer("pointermove", 2, 20, 0);
  pointer("pointerup", 1, 0, 0);
  pointer("pointerup", 2, 20, 0);
  expect(onDraw).not.toHaveBeenCalled();
  tap(3, 0, 0);
  expect(svg.querySelector('line[stroke-dasharray]')).toBeInTheDocument();
  tap(4, 2, 0);
  expect(onDraw).toHaveBeenCalledTimes(1);
});
