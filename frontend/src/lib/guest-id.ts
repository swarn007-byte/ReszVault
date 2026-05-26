const GUEST_ID_KEY = "reszvault-guest-id";

export function getGuestId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;

  const generated =
    window.crypto?.randomUUID?.() ??
    `guest_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  window.localStorage.setItem(GUEST_ID_KEY, generated);
  return generated;
}
