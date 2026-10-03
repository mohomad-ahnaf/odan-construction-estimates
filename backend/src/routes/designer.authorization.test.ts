import { describe, expect, it, vi } from "vitest";
import { routes } from "./index.js";

describe("3D Designer route permissions", () => {
  it("restricts all designer endpoints to ADMIN", () => {
    const paths = ["/projects/:projectId/designer", "/projects/:projectId/designer/review"];
    const stack = (routes as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack;
    for (const path of paths) for (const layer of stack.filter((entry) => entry.route?.path === path)) {
      const guard = layer.route!.stack[0]!.handle;
      expect(() => guard({ user: { role: "ESTIMATOR" } }, {}, vi.fn())).toThrow(
        expect.objectContaining({ status: 403 }));
      const next = vi.fn(); guard({ user: { role: "ADMIN" } }, {}, next);
      expect(next).toHaveBeenCalledWith();
    }
  });
});
