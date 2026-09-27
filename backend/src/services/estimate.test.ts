import { describe, it, expect, vi } from "vitest";
vi.mock("../repositories/estimate.repository.js", () => ({
  estimateRepository: {},
}));
import { checkTransition } from "./estimate.service.js";
describe("approval policy", () => {
  it("allows an estimator to submit a draft", () =>
    expect(() => checkTransition("DRAFT", "SENT", "ESTIMATOR")).not.toThrow());
  it("requires an administrator to approve or reject", () => {
    expect(() => checkTransition("SENT", "APPROVED", "ESTIMATOR")).toThrow(
      "Only administrators",
    );
    expect(() => checkTransition("SENT", "REJECTED", "ESTIMATOR")).toThrow(
      "Only administrators",
    );
    expect(() => checkTransition("SENT", "APPROVED", "ADMIN")).not.toThrow();
  });
  it("keeps approved estimates immutable and rejects invalid transitions", () => {
    expect(() => checkTransition("APPROVED", "DRAFT", "ADMIN")).toThrow();
    expect(() => checkTransition("DRAFT", "APPROVED", "ADMIN")).toThrow();
  });
});
