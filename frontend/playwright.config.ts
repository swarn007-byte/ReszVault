import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const frontendUrl = "http://127.0.0.1:5185";
const deployedUrl = process.env.PLAYWRIGHT_BASE_URL;
const backendUrl = "http://127.0.0.1:8011";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: deployedUrl ?? frontendUrl,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  webServer: deployedUrl ? undefined : [
    {
      command: "python backend/manage.py runserver 127.0.0.1:8011 --noreload",
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      url: `${backendUrl}/health`,
      env: {
        DATABASE_URL: "", DJANGO_DEBUG: "1", RESZVAULT_DB_HOST: "127.0.0.1",
        RESZVAULT_LOCAL_EMBEDDINGS: "0", GROQ_API_KEY: "", FRONTEND_ORIGIN: frontendUrl,
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5185 --strictPort",
      url: frontendUrl,
      env: { RESZVAULT_API_TARGET: backendUrl, VITE_API_BASE_URL: "" },
    },
  ],
});
