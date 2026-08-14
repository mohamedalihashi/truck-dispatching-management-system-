import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Do not refresh an active booking/trip screen automatically when a
      // deployment becomes available. PwaUpdatePrompt lets the user decide
      // when it is safe to reload.
      registerType: "prompt",
      // Registration is handled in PwaUpdatePrompt via virtual:pwa-register.
      injectRegister: false,
      strategies: "generateSW",
      filename: "sw.js",
      includeAssets: [
        "favicon.png",
        "favicon.svg",
        "apple-touch-icon.png",
        "brand/gaarihel-logo.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "pwa-maskable-512x512.png"
      ],
      manifestFilename: "manifest.webmanifest",
      manifest: {
        id: "/",
        name: "GaariHel Management System",
        short_name: "GaariHel",
        description:
          "GaariHel — hel gaari, dir rarkaaga. Truck dispatch Management system for Somalia.",
        theme_color: "#00224D",
        background_color: "#00224D",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/?source=pwa",
        categories: ["business", "transportation"],
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
        globIgnores: ["**/hero/**"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          }
        ]
      },
      // Localhost install needs a SW. Clear stale caches in main.jsx on boot.
      // Set VITE_PWA_DEV=false to disable if Windows cache issues return.
      devOptions: {
        enabled: process.env.VITE_PWA_DEV !== "false",
        type: "module",
        navigateFallback: "index.html"
      }
    })
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/uploads": "http://127.0.0.1:4000",
      "/socket.io": {
        target: "http://127.0.0.1:4000",
        ws: true
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/uploads": "http://127.0.0.1:4000",
      "/socket.io": {
        target: "http://127.0.0.1:4000",
        ws: true
      }
    }
  }
});
