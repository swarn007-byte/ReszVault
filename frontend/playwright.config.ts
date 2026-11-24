import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const frontendUrl = "http://127.0.0.1:5185";
const backendUrl = "http://127.0.0.1:8011";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: frontendUrl,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  webServer: [
    {
      command: "python django_demo/manage.py runserver 127.0.0.1:8011 --noreload",
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      url: `${backendUrl}/api/demo/vaults/`,
      env: { RESZVAULT_DEMO_USE_GROQ: "0" },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5185 --strictPort",
      url: `${frontendUrl}/django-demo`,
      env: { RESZVAULT_DEMO_API_URL: backendUrl },
    },
  ],
});
