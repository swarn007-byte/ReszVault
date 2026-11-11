import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:5175",
    trace: "retain-on-failure",
    launchOptions: existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium" }
      : {},
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1512, height: 982 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "python3 -m uvicorn main:app --host 0.0.0.0 --port 3000",
      cwd: fileURLToPath(new URL("../backend", import.meta.url)),
      url: "http://localhost:3000/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -- --host 0.0.0.0 --port 5175 --strictPort",
      url: "http://localhost:5175",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
