import { describe, expect, it } from "vitest";
import { restoredTunnelOrigin, tunnelHost } from "./tunnel-origin";

describe("forwarded frontend hostname", () => {
  it("extracts only an exact HTTPS hostname", () => {
    expect(tunnelHost(undefined)).toBeUndefined();
    expect(tunnelHost("https://odan-43187.example.devtunnels.ms"))
      .toBe("odan-43187.example.devtunnels.ms");
    expect(tunnelHost("https://odan-43187.example.devtunnels.ms/"))
      .toBe("odan-43187.example.devtunnels.ms");
  });
  it.each([
    "http://odan-43187.example.devtunnels.ms",
    "https://odan-43187.example.devtunnels.ms/path",
    "https://odan-43187.example.devtunnels.ms/?next=1",
    "https://user:password@odan-43187.example.devtunnels.ms",
    "not-a-url",
  ])("rejects an unsafe or non-origin URL: %s", (value) => {
    expect(() => tunnelHost(value)).toThrow(/exact HTTPS frontend origin/);
  });
});

const forwardedOrigin = "https://odan-43187.example.devtunnels.ms";
const rewritten = {
  origin: "http://localhost:43187",
  "x-forwarded-host": "odan-43187.example.devtunnels.ms",
  "x-forwarded-proto": "https",
  "sec-fetch-site": "same-origin",
  referer: `${forwardedOrigin}/site-photos`,
};

describe("Dev Tunnels Origin restoration", () => {
  it("restores only the configured HTTPS frontend origin for its localhost rewrite", () => {
    expect(restoredTunnelOrigin(rewritten, forwardedOrigin)).toBe(forwardedOrigin);
    expect(restoredTunnelOrigin({ ...rewritten, referer: undefined }, forwardedOrigin)).toBe(forwardedOrigin);
    expect(restoredTunnelOrigin({ ...rewritten, "sec-fetch-site": undefined }, forwardedOrigin)).toBe(forwardedOrigin);
  });
  it.each([
    { origin: "https://attacker.test" },
    { "x-forwarded-host": "other.example.devtunnels.ms" },
    { "x-forwarded-proto": "http" },
    { "sec-fetch-site": "cross-site" },
    { referer: "https://attacker.test/" },
    { "sec-fetch-site": undefined, referer: undefined },
  ])("does not restore Origin for mismatched or unverified requests", (change) => {
    expect(restoredTunnelOrigin({ ...rewritten, ...change }, forwardedOrigin)).toBeUndefined();
  });
  it("does nothing when no tunnel is configured", () => {
    expect(restoredTunnelOrigin(rewritten, undefined)).toBeUndefined();
  });
});
