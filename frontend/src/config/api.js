/**
 * Shared frontend ↔ backend URLs.
 * Local dev: Vite proxies /api, /uploads, /socket.io → http://127.0.0.1:4000
 * Vercel: same origin — /api hits the serverless Express handler.
 */

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function isLocalBackendUrl(url) {
  return /localhost|127\.0\.0\.1/.test(url);
}

export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL?.trim();
  // Netlify/static hosts: set VITE_API_URL to the Render (or other) API origin.
  if (configured && !isLocalBackendUrl(configured)) return configured.replace(/\/$/, "");
  // Same-origin API (Vercel fullstack / local Vite proxy).
  if (!isLocalDevHost()) return "/api";
  if (configured) return configured;
  return "/api";
}

export function getSocketUrl() {
  if (!isRealtimeSocketEnabled()) return "";

  const configured = import.meta.env.VITE_SOCKET_URL?.trim();
  if (configured && !isLocalBackendUrl(configured)) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return configured || "";
}

/** Socket.io only works with the local Node server — not on Vercel serverless. */
export function isRealtimeSocketEnabled() {
  return isLocalDevHost();
}

/** Base URL for /uploads paths (empty when using same-origin relative paths). */
export function getUploadsBaseUrl() {
  const api = getApiBaseUrl();
  if (api.startsWith("http")) {
    return api.replace(/\/api\/?$/, "");
  }
  return "";
}

export function resolveUploadUrl(path) {
  if (!path || path.startsWith("mock://") || path.startsWith("http")) {
    return path;
  }
  const base = getUploadsBaseUrl();
  return base ? `${base}${path}` : path;
}
