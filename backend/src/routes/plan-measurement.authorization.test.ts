import { describe, expect, it, vi } from "vitest";
import { routes } from "./index.js";

const planPaths = [
  "/projects/:projectId/plans",
  "/projects/:projectId/plan-measurements",
  "/projects/:projectId/plans/:documentId/pages/:pageNumber",
  "/projects/:projectId/plans/:documentId/measurement-groups",
  "/projects/:projectId/plans/:documentId/calibration",
  "/projects/:projectId/plans/:documentId/measurements",
  "/plan-measurements/:id",
  "/plan-measurement-groups/:id",
];

describe("plan measurement authorization", () => {
  it("keeps every plan endpoint restricted to ADMIN", () => {
    const stack = (routes as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack;
    for (const path of planPaths) {
      const layers = stack.filter((candidate) => candidate.route?.path === path);
      expect(layers.length, path).toBeGreaterThan(0);
      for (const layer of layers) {
        const guard = layer.route!.stack[0]!.handle;
        expect(() => guard({ user: { role: "ESTIMATOR" } }, {}, vi.fn())).toThrow(
          expect.objectContaining({ status: 403 }),
        );
        const allowed = vi.fn();
        guard({ user: { role: "ADMIN" } }, {}, allowed);
        expect(allowed).toHaveBeenCalledWith();
      }
    }
  });
});
