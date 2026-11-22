import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

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
    proxy: {
      "/api/auth": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
      "^/books": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
      "^/chat": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
      "^/auth": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
      "/health": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
    },
  },
});
