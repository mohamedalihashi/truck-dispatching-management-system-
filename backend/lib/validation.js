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
