import { defineConfig } from "vitest/config";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  server: { proxy: { "/api": backend, "/health": backend } },
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
});
