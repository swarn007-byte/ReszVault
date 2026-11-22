/** Use the Vite dev proxy and Vercel production rewrites by default. */
export function getApiBase(): string {
  if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  return "";
}
