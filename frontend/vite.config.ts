import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { restoredTunnelOrigin, tunnelHost } from "./tunnel-origin";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const forwardedOrigin = loadEnv("development", repoRoot, "ODAN_TUNNEL_ORIGIN").ODAN_TUNNEL_ORIGIN;
const forwardedHost = tunnelHost(forwardedOrigin);
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    allowedHosts: forwardedHost ? [forwardedHost] : [],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:43188",
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest, request) => {
            const origin = restoredTunnelOrigin(request.headers, forwardedOrigin);
            if (origin) proxyRequest.setHeader("Origin", origin);
          });
        },
      },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
});
