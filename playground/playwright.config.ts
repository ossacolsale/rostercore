import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";
const settings = mkdtempSync(path.join(tmpdir(), "rostercore-playwright-"));
process.on("exit", () => rmSync(settings, { recursive: true, force: true }));

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:4318",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node server.mjs --production",
    url: "http://127.0.0.1:4318/api/health",
    env: { PORT: "4318", ROSTERCORE_SETTINGS: path.join(settings, "location.json") },
    reuseExistingServer: false,
  },
});
