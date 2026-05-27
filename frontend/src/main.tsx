import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initTheme } from "./store/themeStore";

const shouldNormalizeLocalhost = import.meta.env.DEV && window.location.hostname === "127.0.0.1";

if (shouldNormalizeLocalhost) {
  window.location.replace(
    `http://localhost:${window.location.port}${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
} else {
  initTheme();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
