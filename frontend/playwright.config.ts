import { defineConfig } from "@playwright/test";

// Runs against the Docker container. Start it first: docker compose up --build
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
  },
});
