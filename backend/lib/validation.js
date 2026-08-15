import { z } from "zod";

export const strongPasswordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters");

/** Full personal name: letters + spaces (e.g. "Cabdi Xaashi"), optional hyphen/apostrophe. */
export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter a full name")
  .max(150, "Name is too long")
  .refine((value) => /^[\p{L}\p{M}]+(?:[\s'.-]+[\p{L}\p{M}]+)*$/u.test(value), {
    message: "Use a valid full name (letters and spaces; no numbers)"
  });

export const shortTextSchema = z.string().trim().min(1).max(100);
export const mediumTextSchema = z.string().trim().min(1).max(255);
export const longTextSchema = z.string().trim().min(1).max(2000);

/** Email when provided must be valid; empty / missing is allowed. */
export const optionalEmailSchema = z.preprocess(
  (value) => {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed === "" ? undefined : trimmed.toLowerCase();
  },
  z.string().email("Enter a valid email").max(254).optional()
);

export function isPlaceholderEmail(email) {
  if (!email) return true;
  return /@(offline|noemail)\.local$/i.test(String(email));
}

/** DB still requires a unique email — synthesize one when the user skipped it. */
export function resolveAccountEmail({ email, username, phone } = {}) {
  const cleaned = String(email || "").trim().toLowerCase();
  if (cleaned) return cleaned;
  const base =
    String(username || phone || `user${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 40) || `user${Date.now()}`;
  return `${base}@noemail.local`;
}
