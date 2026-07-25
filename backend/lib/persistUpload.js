import path from "node:path";
import { uploadDir } from "./uploads.js";
import { isCloudinaryConfigured, uploadBuffer } from "../services/cloudinaryService.js";

/**
 * Persist an uploaded multer file to Cloudinary (preferred) or local disk.
 * On Vercel, Cloudinary is required — local /uploads is not durable.
 */
export async function persistUploadedFile(file, folder = "misc") {
  if (!file) return null;

  if (process.env.VERCEL && !isCloudinaryConfigured()) {
    const error = new Error(
      "Cloudinary must be configured on Vercel. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
    );
    error.status = 503;
    throw error;
  }

  // Memory storage (Vercel / registration) — upload buffer to Cloudinary or local.
  if (file.buffer) {
    const result = await uploadBuffer(file, folder);
    return result?.url || null;
  }

  // Disk storage (local API) — already saved under uploads/.
  if (file.path || file.filename) {
    const filename = file.filename || path.basename(file.path);
    return `/uploads/${filename}`;
  }

  return null;
}

export { uploadDir };
