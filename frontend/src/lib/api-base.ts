/** Keep API calls on the app origin unless a backend is configured. */
export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
}
