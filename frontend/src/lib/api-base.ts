/**
 * API base URL.
 * - Dev: call the Python backend directly so auth cookies stay on localhost.
 * - Prod (Vercel): vercel.json rewrites same paths → Render; use browser origin
 */
export function getApiBase(): string {
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}
