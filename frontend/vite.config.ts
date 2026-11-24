import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

const apiTarget = process.env.RESZVAULT_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: Object.fromEntries(
      ["/api/auth", "/api/github", "/api/projects", "/auth/providers", "^/books", "^/chat", "/health"].map((path) => [
        path,
        { target: apiTarget },
      ]),
    ),
  },
});
