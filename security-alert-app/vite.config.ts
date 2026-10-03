/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The app and the SurgeGuard API share one origin: /api and /ws are proxied to
// the backend, so the HttpOnly session cookie and the Command Center socket
// work exactly as they do for the Command Center itself.
//
// `@` points at the Command Center's source. The app reuses its socket client
// and wire-contract types rather than keeping a second copy of either.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_BACKEND_URL || "http://127.0.0.1:8001";
  const port = Number(env.VITE_PORT) || 5190;
  const host = env.VITE_HOST || "0.0.0.0";
  const proxy = {
    "/api": { target: backend, changeOrigin: false },
    "/ws": { target: backend.replace(/^http/, "ws"), ws: true, changeOrigin: false },
  };

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("../frontend/src", import.meta.url)) },
    },
    server: {
      host,
      port,
      strictPort: true,
      proxy,
      fs: { allow: [".", "../frontend/src"] },
    },
    preview: { host, port: port + 1, strictPort: true, proxy },
    build: { target: "es2022", sourcemap: true },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      restoreMocks: true,
    },
  };
});
