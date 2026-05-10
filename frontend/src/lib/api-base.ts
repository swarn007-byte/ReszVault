/**
 * API base URL.
 * - Dev: Vite proxies /api/auth, /auth, /chat → localhost:3000
 * - Prod (Vercel): vercel.json rewrites same paths → Render; use browser origin
 */
export function getApiBase(): string {
  if (import.meta.env.DEV) {
    return typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}
