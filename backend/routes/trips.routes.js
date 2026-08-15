import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createFeedbackToken } from "../services/deliveryFeedbackService.js";
import { sendTripEventSms } from "../services/cargoSmsService.js";
import { db } from "../services/dbService.js";
import { emitUserNotification } from "../lib/notifyRealtime.js";
import { prisma } from "../lib/prisma.js";
import {
  createTrackingLink,
  revokeTrackingLink,
  getTripTrackingForViewer,
} from "../services/trackingLinkService.js";

const router = Router();
const uploadDir = process.env.VERCEL
  ? path.join(os.tmpdir(), "truck-uploads")
  : path.join(process.cwd(), "uploads");

try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch {
  // Serverless filesystem may be read-only outside /tmp.
}

const upload = multer(
  process.env.VERCEL
    ? { storage: multer.memoryStorage() }
    : { dest: uploadDir }
);

const statusSchema = z
  .object({
    status: z.enum([
      "Pending",
      "Assigned",
      "En Route to Pickup",
      "Arrived at Pickup",
      "Picked Up",
      "In Transit",
      "Near Destination",
      "Delivered",
      "Cancelled"
    ]),
    weightAmount: z.coerce.number().positive().optional(),
    weightUnit: z.enum(["kg", "tons"]).optional(),
    measuredQuantity: z.coerce.number().positive().optional(),
    measurementUnit: z.enum(["KG", "LITER", "HEAD", "MIXED"]).optional(),
    measurements: z
      .object({
        kg: z.coerce.number().positive().optional(),
        liter: z.coerce.number().positive().optional(),
        head: z.coerce.number().int().positive().optional(),
      })
      .optional(),
    deliveryConfirmCode: z.string().trim().min(4).max(12).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "Picked Up") {
      const hasLegacy = data.weightAmount != null && data.weightAmount > 0;
      const hasMeasured = data.measuredQuantity != null && data.measuredQuantity > 0;
      const m = data.measurements || {};
      const hasMixed =
        (m.kg != null && m.kg > 0) ||
        (m.liter != null && m.liter > 0) ||
        (m.head != null && m.head > 0);
      if (!hasLegacy && !hasMeasured && !hasMixed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["measuredQuantity"],
          message: "Enter the actual measurement when marking Picked Up"
        });
      }
      if (hasLegacy && !data.weightUnit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weightUnit"],
          message: "Select kg or tons"
        });
      }
    }
    if (data.status === "Delivered" && !String(data.deliveryConfirmCode || "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deliveryConfirmCode"],
        message: "Gali koodhka xaqiijinta ee macmiilka"
      });
    }
  });

const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  productRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional()
});

router.use(requireAuth);
router.use(requirePasswordChanged);
router.use(requirePermission("trips"));

router.get("/", async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit
    };
    if (req.user.role === "driver") {
      filters.driverId = req.user.sub;
    } else if (req.user.role === "customer") {
      filters.customerId = req.user.sub;
    } else if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not allowed to list trips" });
    }
    const result = await db.listTrips(filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const filters = {};
    if (req.user.role === "driver") {
      filters.driverId = req.user.sub;
    } else if (req.user.role === "customer") {
      filters.customerId = req.user.sub;
    } else if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not allowed" });
    }
    res.json(await db.tripSummary(filters));
  } catch (error) {
    next(error);
  }
});

router.get("/feedback", requireRole("admin", "driver"), async (req, res, next) => {
  try {
    const filters = {
      page: req.query.page,
      limit: req.query.limit || 10
    };
    if (req.user.role === "driver") filters.driverId = req.user.sub;
    const result = await db.listTripFeedback(filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", requireRole("driver", "admin"), validate(statusSchema), async (req, res, next) => {
  try {
    let weight;
    let measuredQuantity;
    let measurementUnit;

    if (req.body.status === "Picked Up") {
      if (req.body.measurements) {
        measuredQuantity = req.body.measuredQuantity;
        measurementUnit = req.body.measurementUnit;
      } else if (req.body.measuredQuantity != null) {
        measuredQuantity = Number(req.body.measuredQuantity);
        measurementUnit = req.body.measurementUnit;
      } else if (req.body.weightAmount != null) {
        const unit = req.body.weightUnit || "kg";
        measuredQuantity = unit === "tons" ? Number(req.body.weightAmount) * 1000 : Number(req.body.weightAmount);
        measurementUnit = "KG";
        weight = `${req.body.weightAmount} ${unit}`;
      }
    }

    const result = await db.updateTripStatus(req.params.id, req.body.status, req.user.sub, {
      role: req.user.role,
      driverId: req.user.role === "driver" ? req.user.sub : undefined,
      weight,
      measuredQuantity,
      measurementUnit,
      measurements: req.body.measurements,
      deliveryConfirmCode: req.body.deliveryConfirmCode,
    });
    if (!result) return res.status(404).json({ message: "Trip not found" });
    req.app.get("io")?.emit("trip.status.updated", result.trip);
    emitUserNotification(req.app.get("io"), result.notification);
    const event = {
      "En Route to Pickup": "cargo.en_route_pickup",
      "Arrived at Pickup": "cargo.arrived_pickup",
      "Picked Up": "cargo.picked_up",
      "In Transit": "cargo.in_transit",
      "Near Destination": "cargo.near_destination",
      Cancelled: "cargo.cancelled",
    }[req.body.status];
    if (req.body.status === "Delivered") {
      const token = await createFeedbackToken(result.trip.id);
      void sendTripEventSms(result.trip.id, "cargo.delivered", { feedbackToken: token })
        .catch((error) => console.error("Delivered SMS failed:", error.message));
    } else if (event) {
      void sendTripEventSms(result.trip.id, event)
        .catch((error) => console.error("Trip SMS failed:", error.message));
    }
    res.json(result.trip);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/accept", requireRole("driver"), async (req, res, next) => {
  try {
    const result = await db.updateTripStatus(req.params.id, "En Route to Pickup", req.user.sub, {
      driverId: req.user.sub,
      role: "driver"
    });
    if (!result) return res.status(404).json({ message: "Trip not found" });
    req.app.get("io")?.emit("trip.status.updated", result.trip);
    void sendTripEventSms(result.trip.id, "cargo.en_route_pickup")
      .catch((error) => console.error("En-route SMS failed:", error.message));
    res.json(result.trip);
  } catch (error) {
    next(error);
  }
});

const adjustSchema = z.object({
  fare: z.coerce.number().positive().optional(),
  estimatedTime: z.string().trim().min(1).max(50).optional(),
  notes: z.string().trim().max(500).optional()
}).refine((data) => data.fare != null || data.estimatedTime != null || data.notes !== undefined, {
  message: "Provide fare, estimated time, or notes to update"
});

router.patch("/:id/assignment", requireRole("driver"), validate(adjustSchema), async (req, res, next) => {
  try {
    if (req.body.fare != null || req.body.estimatedTime != null) {
      return res.status(403).json({
        message: "Drivers cannot change fare or ETA. Accept or Reject only."
      });
    }
    const trip = await db.adjustAssignedTrip(req.params.id, req.user.sub, req.body);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    req.app.get("io")?.emit("trip.status.updated", trip);
    res.json(trip);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/reject", requireRole("driver"), async (req, res, next) => {
  try {
    const result = await db.rejectTrip(req.params.id, req.user.sub);
    if (!result) return res.status(404).json({ message: "Trip not found" });
    req.app.get("io")?.emit("trip.rejected", result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

const locationSchema = z.object({
  lat: z.coerce.number().finite(),
  lng: z.coerce.number().finite(),
  accuracy: z.coerce.number().finite().positive().max(5000).optional(),
  speed: z.coerce.number().finite().min(0).max(100).optional(),
  speedKmh: z.coerce.number().finite().min(0).max(250).optional(),
  heading: z.coerce.number().finite().min(0).max(360).optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

router.patch("/:id/location", requireRole("driver"), validate(locationSchema), async (req, res, next) => {
  try {
    const trip = await db.updateTripLocation(
      req.params.id,
      {
        lat: Number(req.body.lat),
        lng: Number(req.body.lng),
        ...(req.body.accuracy != null ? { accuracy: Number(req.body.accuracy) } : {}),
        ...(req.body.speed != null ? { speed: Number(req.body.speed) } : {}),
        ...(req.body.speedKmh != null ? { speedKmh: Number(req.body.speedKmh) } : {}),
        ...(req.body.heading != null ? { heading: Number(req.body.heading) } : {}),
        ...(req.body.timestamp != null ? { timestamp: req.body.timestamp } : {}),
      },
      { driverId: req.user.sub, io: req.app.get("io") }
    );
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    req.app.get("io")?.emit("location.updated", {
      tripId: trip.id,
      truckId: trip.truckId,
      location: trip.lastLocation,
      gpsStatus: trip.gpsStatus,
      distanceTraveledKm: trip.distanceTraveledKm,
      distance: trip.distance,
      status: trip.status,
      progress: trip.progress,
    });
    req.app.get("io")?.emit("truck:location:update", {
      tripId: trip.id,
      truckId: trip.truckId,
      location: trip.lastLocation,
      gpsStatus: trip.gpsStatus,
      progress: trip.progress,
    });
    res.json(trip);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/locations", async (req, res, next) => {
  try {
    const points = await db.listTripLocationHistory(req.params.id, {
      userId: req.user.sub,
      role: req.user.role,
    });
    if (points == null) return res.status(404).json({ message: "Trip not found" });
    res.json({ points });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/replay", async (req, res, next) => {
  try {
    const replay = await db.getTripReplay(req.params.id, {
      userId: req.user.sub,
      role: req.user.role,
    });
    if (!replay) return res.status(404).json({ message: "Trip not found" });
    res.json(replay);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/events", async (req, res, next) => {
  try {
    const events = await db.listTripEvents(req.params.id, {
      userId: req.user.sub,
      role: req.user.role,
    });
    if (events == null) return res.status(404).json({ message: "Trip not found" });
    res.json({ events });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/proof", requireRole("driver", "admin"), upload.single("proof"), async (req, res, next) => {
  try {
    const { persistUploadedFile } = await import("../lib/persistUpload.js");
    let deliveryProofUrl = null;
    if (req.file) {
      deliveryProofUrl = await persistUploadedFile(req.file, "delivery-proofs");
    }
    if (!deliveryProofUrl) {
      deliveryProofUrl = req.body.deliveryProofUrl || null;
    }
    if (!deliveryProofUrl) {
      return res.status(400).json({ message: "Proof image is required" });
    }
    const options = req.user.role === "driver" ? { driverId: req.user.sub } : {};
    const trip = await db.uploadTripProof(
      req.params.id,
      { deliveryProofUrl, signatureUrl: req.body.signatureUrl },
      options
    );
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json(trip);
  } catch (error) {
    next(error);
  }
});

// Ownership (trip.customerId) is the source of truth — not JWT/role alone —
// so a stale session after a role change can still rate their own delivery.
router.post("/:id/feedback", validate(feedbackSchema), async (req, res, next) => {
  try {
    const trip = await db.submitTripFeedback(req.params.id, req.user.sub, req.body);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    if (trip.driverId) {
      req.app.get("io").emit("trip.feedback.submitted", { tripId: trip.id, feedback: trip.feedback });
    }
    res.status(201).json(trip);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/confirm-delivery", async (req, res, next) => {
  try {
    const trip = await db.confirmTripDelivery(req.params.id, req.user.sub);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json(trip);
  } catch (error) {
    next(error);
  }
});

async function assertTripTrackAccess(req, tripId) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { id: true, customerId: true, driverId: true },
  });
  if (!trip) {
    const err = new Error("Trip not found");
    err.status = 404;
    throw err;
  }
  if (req.user.role === "admin") return trip;
  if (req.user.role === "customer" && trip.customerId === req.user.sub) return trip;
  if (req.user.role === "driver" && trip.driverId === req.user.sub) return trip;
  const err = new Error("Not allowed");
  err.status = 403;
  throw err;
}

/** Authenticated live-tracking snapshot (customer/admin/assigned driver). */
router.get("/:id/tracking", requireRole("customer", "admin", "driver"), async (req, res, next) => {
  try {
    await assertTripTrackAccess(req, req.params.id);
    const data = await getTripTrackingForViewer(req.params.id, {
      customerId: req.user.sub,
      role: req.user.role,
    });
    if (!data) return res.status(404).json({ message: "Trip not found" });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/** Create a revocable, expiring public tracking link (never uses sequential trip id). */
router.post("/:id/tracking-link", requireRole("customer", "admin"), async (req, res, next) => {
  try {
    await assertTripTrackAccess(req, req.params.id);
    const link = await createTrackingLink(req.params.id, {
      createdById: req.user.sub,
      label: req.body?.label || null,
      expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
    });
    const origin = process.env.PUBLIC_APP_URL || req.get("origin") || "";
    res.status(201).json({
      ...link,
      url: origin ? `${String(origin).replace(/\/$/, "")}${link.path}` : link.path,
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/tracking-link", requireRole("customer", "admin"), async (req, res, next) => {
  try {
    await assertTripTrackAccess(req, req.params.id);
    const revoked = await revokeTrackingLink(req.params.id, {
      token: req.body?.token || req.query?.token || null,
    });
    res.json({ revoked });
  } catch (error) {
    next(error);
  }
});

export default router;
