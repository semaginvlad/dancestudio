export const ADMIN_EMAILS = ["semagin.vlad@gmail.com"];

export const normalizeEmail = (email = "") => String(email || "").trim().toLowerCase();

export function isAdminEmail(email, adminEmails = ADMIN_EMAILS) {
  const normalized = normalizeEmail(email);
  return !!normalized && adminEmails.map(normalizeEmail).includes(normalized);
}
