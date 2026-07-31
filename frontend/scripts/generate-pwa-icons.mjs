import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const logoPath = join(publicDir, "brand", "gaarihel-logo.png");
const logo = readFileSync(logoPath);

const BG = { r: 255, g: 255, b: 255, alpha: 1 };
const MASK_BG = { r: 13, g: 28, b: 50, alpha: 1 }; // #0d1c32

const sizes = [
  { name: "favicon-32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "pwa-192x192.png", size: 192 },
  { name: "pwa-512x512.png", size: 512 },
  { name: "pwa-maskable-512x512.png", size: 512, maskable: true }
];

for (const { name, size, maskable } of sizes) {
  const padding = maskable ? 0.18 : 0.08;
  const inner = Math.round(size * (1 - padding * 2));
  const resized = await sharp(logo)
    .resize(inner, inner, {
      fit: "contain",
      background: maskable ? MASK_BG : BG
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: maskable ? MASK_BG : BG
    }
  })
    .composite([{ input: resized, gravity: "centre" }])
    .png()
    .toFile(join(publicDir, name));
}

// Also write favicon.ico-compatible PNG as favicon.png for browsers
await sharp(logo)
  .resize(64, 64, { fit: "contain", background: BG })
  .png()
  .toFile(join(publicDir, "favicon.png"));

console.log("GaariHel PWA icons generated in frontend/public/");
