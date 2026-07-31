import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler, notFound } from "./middleware/error.js";
import { db } from "./services/dbService.js";
import authRoutes from "./routes/auth.routes.js";
import cargoRequestRoutes from "./routes/cargoRequests.routes.js";
import tripRoutes from "./routes/trips.routes.js";
import truckRoutes from "./routes/trucks.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import reportRoutes from "./routes/reports.routes.js";
import userRoutes from "./routes/users.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import paymentRoutes from "./routes/payments.routes.js";
import earningsRoutes from "./routes/earnings.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import quotesRoutes from "./routes/quotes.routes.js";
import supportRoutes from "./routes/support.routes.js";
import marketplaceRoutes from "./routes/marketplace.routes.js";
import sharedTripsRoutes from "./routes/sharedTrips.routes.js";
import publicRoutes from "./routes/public.routes.js";
import { auditContextMiddleware } from "./lib/auditContext.js";
import { isCloudinaryConfigured } from "./services/cloudinaryService.js";
import { getWaafiPublicConfig } from "./services/waafiPayService.js";
import { isSmsConfigured, retryDueSms } from "./services/smsService.js";
import { prisma } from "./lib/prisma.js";

function looksLikePlaceholder(value = "") {
  return /your[_-]?|replace-with|xxxxx|changeme|example|<|>/i.test(String(value || ""));
}

function getIntegrationsStatus() {
  const waafi = getWaafiPublicConfig();
  const smtpUser = process.env.SMTP_USER || "";
  const smtpPass = process.env.SMTP_PASS || "";
  const emailReady =
    process.env.EMAIL_DEV_MODE === "true" ||
    (Boolean(smtpUser && smtpPass) && !looksLikePlaceholder(smtpUser) && !looksLikePlaceholder(smtpPass));
  const appPublicUrl = process.env.APP_PUBLIC_URL || "";
  const appPublicReady =
    Boolean(appPublicUrl) &&
    !looksLikePlaceholder(appPublicUrl) &&
    !/localhost|127\.0\.0\.1/i.test(appPublicUrl);

  return {
    database: true,
    cloudinary: {
      configured: isCloudinaryConfigured(),
      requiredOnVercel: Boolean(process.env.VERCEL),
      fallback: isCloudinaryConfigured() ? "cloudinary" : process.env.VERCEL ? "broken" : "local-uploads"
    },
    waafiPay: {
      configured: waafi.enabled && !waafi.devMock,
      currency: waafi.currency,
      devMock: waafi.devMock,
      productionReady: waafi.enabled && !waafi.devMock
    },
    sms: {
      configured: isSmsConfigured()
    },
    email: {
      configured: emailReady,
      otpEnabled: process.env.AUTH_OTP_ENABLED !== "false",
      devMode: process.env.EMAIL_DEV_MODE === "true"
    },
    appPublicUrl: {
      configured: appPublicReady,
      value: appPublicReady ? appPublicUrl : null
    }
  };
}

export function createNoopIo() {
  const noop = () => {};
  const room = { emit: noop };
  return {
    emit: noop,
    on: noop,
    to: () => room
  };
}

function buildAllowedOrigins() {
  const fromEnv = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const vercelBranch = process.env.VERCEL_BRANCH_URL
    ? `https://${process.env.VERCEL_BRANCH_URL}`
    : null;

  // Known production frontends (Netlify / Vercel). Extra origins still come from CLIENT_ORIGIN.
  const knownFrontends = [
    "https://truck-dispatche.netlify.app",
    "https://truck-dispa.vercel.app"
  ];

  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const localDev = isProd
    ? []
    : ["http://127.0.0.1:5173", "http://localhost:5173"];

  return [...new Set([
    ...fromEnv,
    ...knownFrontends,
    vercelOrigin,
    vercelBranch,
    ...localDev
  ].filter(Boolean))];
}

export function createApp({ io } = {}) {
  const app = express();
  const uniqueOrigins = buildAllowedOrigins();

  function corsOrigin(origin, callback) {
    if (!origin || uniqueOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked: ${origin}`));
  }

  app.set("io", io || createNoopIo());
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(auditContextMiddleware);

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - startedAt;
      if (process.env.NODE_ENV !== "test") {
        console.log(`[API] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
      }
    });
    next();
  });

  if (!process.env.VERCEL) {
    app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  }

  app.get("/api/health", async (req, res) => {
    const startedAt = Date.now();
    const integrations = getIntegrationsStatus();

    if (process.env.VERCEL || req.query.retrySms === "1") {
      void retryDueSms().catch((error) => console.warn("SMS retry failed:", error.message));
    }

    try {
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - startedAt;

      if (req.query.full === "1") {
        const stats = await db.dashboardStats();
        const missing = Object.entries(integrations)
          .filter(([, value]) => value && typeof value === "object" && value.configured === false)
          .map(([key]) => key);

        if (process.env.VERCEL && !integrations.cloudinary.configured) {
          missing.push("cloudinary");
        }

        return res.json({
          status: missing.length ? "degraded" : "ok",
          database: "connected",
          latencyMs,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          integrations,
          missing: [...new Set(missing)],
          stats
        });
      }

      res.json({
        success: true,
        database: "connected",
        latencyMs,
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        integrations
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        database: "disconnected",
        message: error.message,
        integrations: { ...integrations, database: false }
      });
    }
  });

  // Secure cron endpoint for SMS retries (set CRON_SECRET in Vercel + cron job).
  // Vercel Cron sends GET by default.
  async function smsRetryHandler(req, res) {
    const secret = process.env.CRON_SECRET || "";
    const provided = req.get("x-cron-secret") || req.query.secret || req.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    // Allow Vercel Cron without secret only when CRON_SECRET is unset (not recommended).
    const isVercelCron = Boolean(req.get("x-vercel-cron"));
    if (secret && provided !== secret && !isVercelCron) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (secret && isVercelCron && provided && provided !== secret) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const result = await retryDueSms();
      res.json({ ok: true, result: result || null });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }
  app.get("/api/internal/sms-retry", smsRetryHandler);
  app.post("/api/internal/sms-retry", smsRetryHandler);

  app.use("/api/public", publicRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/public/feedback", feedbackRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/cargo-requests", cargoRequestRoutes);
  app.use("/api/trips", tripRoutes);
  app.use("/api/trucks", truckRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/earnings", earningsRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/quotes", quotesRoutes);
  app.use("/api/support", supportRoutes);
  app.use("/api/marketplace", marketplaceRoutes);
  app.use("/api/shared-trips", sharedTripsRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
