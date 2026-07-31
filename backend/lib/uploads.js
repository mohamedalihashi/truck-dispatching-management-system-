import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

export const uploadDir = process.env.VERCEL
  ? path.join(os.tmpdir(), "truck-uploads")
  : path.join(process.cwd(), "uploads");

try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch {
  // Serverless filesystem may be read-only outside /tmp.
}

const storage = process.env.VERCEL
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
      }
    });

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
      return;
    }
    cb(null, true);
  }
});

export const documentUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, WebP, and PDF files are allowed"));
      return;
    }
    cb(null, true);
  }
});

export const registrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, WebP, and PDF files are allowed"));
      return;
    }
    cb(null, true);
  }
});
