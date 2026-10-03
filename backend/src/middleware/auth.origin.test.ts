import { describe, expect, it } from "vitest";
import { isAllowedCsrfOrigin } from "./auth.js";

const local = "http://127.0.0.1:43187";
const tunnel = "https://odan-43187.example.devtunnels.ms";

describe("CSRF frontend origin allowance", () => {
  it("keeps the local frontend and admits only the configured forwarded origin", () => {
    expect(isAllowedCsrfOrigin(local, local, tunnel)).toBe(true);
    expect(isAllowedCsrfOrigin(tunnel, local, tunnel)).toBe(true);
    expect(isAllowedCsrfOrigin(tunnel, local)).toBe(false);
    expect(isAllowedCsrfOrigin(`${tunnel}.attacker.test`, local, tunnel)).toBe(false);
    expect(isAllowedCsrfOrigin("https://other.example.devtunnels.ms", local, tunnel)).toBe(false);
    expect(isAllowedCsrfOrigin(undefined, local, tunnel)).toBe(false);
  });
});
