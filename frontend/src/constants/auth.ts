export const DIRECT_ENTRY_EMAIL = "swarnshekhar21j@gmail.com";

export function isDirectEntryEmail(email: string): boolean {
  return email.trim().toLowerCase() === DIRECT_ENTRY_EMAIL;
}
