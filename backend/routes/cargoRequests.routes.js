import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";
import {
  formatSomaliaLocation
} from "../lib/somaliaLocations.js";
import { isValidBookingPhone } from "../lib/phone.js";
import { sendBookingCreatedSms, sendCargoRequestEventSms } from "../services/cargoSmsService.js";
import { upload } from "../lib/uploads.js";
import { persistUploadedFile } from "../lib/persistUpload.js";
import { fullNameSchema } from "../lib/validation.js";
import { validateStructuredBooking } from "../lib/structuredBookingValidation.js";
import { emitUserNotification } from "../lib/notifyRealtime.js";

const router = Router();

const requiredName = fullNameSchema;
const bookingPhone = z.string().trim().max(20).refine(isValidBookingPhone, "Enter a valid phone number (at least 7 digits)");
const emptyToUndefined = (value) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalName = z.preprocess(emptyToUndefined, requiredName.optional());
const optionalPhone = z.preprocess(emptyToUndefined, bookingPhone.optional());
const optionalText = z.preprocess(emptyToUndefined, z.string().trim().min(1).max(100).optional());

const cargoRequestFields = z.object({
  pickup: z.string().trim().min(1).max(255).optional(),
  destination: z.string().trim().min(1).max(255).optional(),
  truckType: z.string().trim().min(1).max(100).optional(),
  cargoType: z.string().trim().min(1).max(100).optional(),
  weight: z.string().trim().refine(
    (value) => {
      const normalized = String(value || "").trim().toLowerCase();
      if (!normalized || normalized === "tbd" || normalized === "pending" || normalized === "n/a") return true;
      return Number.parseFloat(normalized) > 0;
    },
    "Cargo weight must be a positive number"
  ).optional().default("TBD"),
  description: z.string().trim().min(1).max(1000).optional(),
  receiver: z.string().optional(),
  sender: z.string().optional(),
  customerRole: z.enum(["SENDER", "RECEIVER"]).optional(),
  senderName: optionalName,
  senderPhone: optionalPhone,
  receiverName: optionalName,
  receiverPhone: optionalPhone,
  fromRegion: optionalText,
  fromDistrict: optionalText,
  fromNeighborhood: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1, "From neighborhood is required").optional()
  ),
  toRegion: optionalText,
  toDistrict: optionalText,
  toNeighborhood: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1, "To neighborhood is required").optional()
  ),
  specialInstructions: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  preferredPickupDate: z.preprocess(
    emptyToUndefined,
    z.string().optional().refine((value) => {
      if (!value) return true;
      const selected = new Date(`${value}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return !Number.isNaN(selected.getTime()) && selected >= today;
    }, "Preferred pickup date cannot be in the past")
  ),
  submissionKey: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  preferredTruckId: z.string().uuid().optional(),
  loadType: z.enum(["FTL", "SHARED"]).optional()
});

export const cargoRequestSchema = cargoRequestFields.superRefine((data, ctx) => {
  validateStructuredBooking(data, ctx);
});

const updateCargoRequestSchema = cargoRequestFields.partial().superRefine((data, ctx) => {
  const updatesStructuredBooking = Boolean(
    data.fromRegion || data.fromDistrict || data.fromNeighborhood ||
    data.toRegion || data.toDistrict || data.toNeighborhood
  );
  if (updatesStructuredBooking) validateStructuredBooking(data, ctx, { allowLegacy: false });
});

const assignSchema = z.object({
  driverId: z.string().uuid(),
  truckId: z.string().uuid(),
  dispatcherId: z.string().uuid().optional(),
  fare: z.coerce.number().positive().optional(),
  estimatedTime: z.string().trim().max(100).optional(),
});

const quoteSchema = z.object({
  quotedPrice: z.coerce.number().positive(),
  quotedEstimatedTime: z.string().min(1),
  quoteNotes: z.string().optional(),
  driverId: z.string().uuid().optional()
});

const rejectQuoteSchema = z.object({
  note: z.string().optional()
});

const declineBookingSchema = z.object({
  note: z.string().trim().min(1).max(500)
});

router.use(requireAuth);
router.use(requirePasswordChanged);
router.use(requirePermission("requests"));

router.get("/", async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      loadType: req.query.loadType,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit
    };
    if (req.user.role === "customer") {
      filters.customerId = req.user.sub;
    } else if (req.user.role === "driver") {
      filters.driverId = req.user.sub;
    } else if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not allowed to list cargo requests" });
    }
    const result = await db.listCargoRequests(filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const filters = {};
    if (req.user.role === "customer") {
      filters.customerId = req.user.sub;
    } else if (req.user.role === "driver") {
      filters.driverId = req.user.sub;
    } else if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not allowed" });
    }
    res.json(await db.cargoRequestSummary(filters));
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("customer", "admin"), validate(cargoRequestSchema), async (req, res, next) => {
  try {
    let customerId = req.user.sub;
    if (req.user.role === "admin") {
      if (!req.body.customerId) {
        return res.status(400).json({ message: "customerId is required" });
      }
      customerId = req.body.customerId;
    }
    const customer = await db.findBookingCustomerById(customerId);
    if (!customer || customer.role !== "customer") {
      return res.status(400).json({ message: "Valid customer is required" });
    }
    if (
      req.user.role === "customer" &&
      req.body.loadType !== "SHARED" &&
      !req.body.preferredTruckId &&
      !req.body.cargoType &&
      !req.body.truckType
    ) {
      return res.status(400).json({
        message: "Cargo type and route details are required to submit a cargo request."
      });
    }
    const hasStructuredLocations = Boolean(
      req.body.fromRegion || req.body.fromDistrict || req.body.fromNeighborhood ||
      req.body.toRegion || req.body.toDistrict || req.body.toNeighborhood
    );
    let bookingDetails = { ...req.body };
    if (hasStructuredLocations) {
      bookingDetails = {
        ...bookingDetails,
        pickup:
          req.body.pickup ||
          formatSomaliaLocation(req.body.fromNeighborhood, req.body.fromDistrict, req.body.fromRegion),
        destination:
          req.body.destination ||
          formatSomaliaLocation(req.body.toNeighborhood, req.body.toDistrict, req.body.toRegion),
      };
    }
    // Customers book against their account; admin may attach optional sender/receiver contacts.
    if (req.user.role === "customer") {
      delete bookingDetails.customerRole;
      delete bookingDetails.senderName;
      delete bookingDetails.senderPhone;
      delete bookingDetails.receiverName;
      delete bookingDetails.receiverPhone;
      delete bookingDetails.sender;
      delete bookingDetails.receiver;
    }

    const { request, notification } = await db.createCargoRequest({
      ...bookingDetails,
      customerId,
      customerName: customer.name,
      preferredTruckId: req.body.preferredTruckId,
      loadType: req.body.loadType || (req.body.preferredTruckId ? "FTL" : undefined)
    });
    req.app.get("io").emit("order.created", request);
    emitUserNotification(req.app.get("io"), notification);
    void sendBookingCreatedSms(request).catch((error) => console.error("Booking SMS failed:", error.message));
    res.status(201).json(request);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("customer", "admin"), validate(updateCargoRequestSchema), async (req, res, next) => {
  try {
    const filters = {};
    if (req.user.role === "customer") filters.customerId = req.user.sub;
    let payload = { ...req.body };
    if (req.user.role === "customer") {
      delete payload.customerRole;
      delete payload.senderName;
      delete payload.senderPhone;
      delete payload.receiverName;
      delete payload.receiverPhone;
      delete payload.sender;
      delete payload.receiver;
    }
    const hasStructuredLocations = Boolean(
      payload.fromRegion || payload.fromDistrict || payload.fromNeighborhood ||
      payload.toRegion || payload.toDistrict || payload.toNeighborhood
    );
    if (hasStructuredLocations) {
      payload = {
        ...payload,
        pickup:
          payload.pickup ||
          formatSomaliaLocation(payload.fromNeighborhood, payload.fromDistrict, payload.fromRegion),
        destination:
          payload.destination ||
          formatSomaliaLocation(payload.toNeighborhood, payload.toDistrict, payload.toRegion),
      };
    }
    const request = await db.updateCargoRequest(req.params.id, payload, filters);
    if (!request) return res.status(404).json({ message: "Cargo request not found" });
    req.app.get("io").emit("order.updated", request);
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/:id/quote",
  requireRole("admin"),
  validate(quoteSchema),
  async (req, res, next) => {
    try {
      const result = await db.submitCargoQuote(req.params.id, {
        quotedPrice: req.body.quotedPrice,
        quotedEstimatedTime: req.body.quotedEstimatedTime,
        quoteNotes: req.body.quoteNotes,
        driverId: req.user.role === "driver" ? req.user.sub : req.body.driverId
      });
      if (!result) return res.status(404).json({ message: "Cargo request not found" });
      req.app.get("io").emit("quote.sent", result.request);
      emitUserNotification(req.app.get("io"), result.notification);
      res.json(result.request);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/:id/quote/accept",
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const request = await db.acceptCargoQuote(req.params.id, { allowAdmin: true });
      if (!request) return res.status(404).json({ message: "Cargo request not found" });
      req.app.get("io").emit("quote.accepted", request);
      void sendCargoRequestEventSms(request, "booking.accepted").catch((error) => console.error("Accepted SMS failed:", error.message));
      res.json(request);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/:id/quote/reject",
  validate(rejectQuoteSchema),
  async (req, res, next) => {
    try {
      if (req.user.role !== "customer") {
        return res.status(403).json({ message: "Only the booking customer can reject a quotation" });
      }
      const request = await db.rejectCargoQuote(req.params.id, {
        customerId: req.user.sub,
        note: req.body.note
      });
      if (!request) return res.status(404).json({ message: "Cargo request not found" });
      req.app.get("io").emit("quote.rejected", request);
      res.json(request);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/:id/decline",
  requireRole("driver"),
  validate(declineBookingSchema),
  async (req, res, next) => {
    try {
      const request = await db.declineCargoBooking(req.params.id, {
        driverId: req.user.sub,
        note: req.body.note
      });
      if (!request) return res.status(404).json({ message: "Cargo request not found" });
      req.app.get("io").emit("booking.declined", request);
      res.json(request);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/:id/assign",
  requireRole("admin"),
  validate(assignSchema),
  async (req, res, next) => {
    try {
      const result = await db.assignCargoRequest(req.params.id, {
        driverId: req.body.driverId,
        truckId: req.body.truckId,
        dispatcherId: req.body.dispatcherId || req.user.sub,
        fare: req.body.fare,
        estimatedTime: req.body.estimatedTime,
      });
      if (!result) return res.status(404).json({ message: "Cargo request not found" });
      req.app.get("io").emit("driver.assigned", result.request);
      emitUserNotification(req.app.get("io"), result.notification);
      void sendCargoRequestEventSms(result.request, "booking.assigned").catch((error) => console.error("Assigned SMS failed:", error.message));
      res.json(result.request);
    } catch (error) {
      next(error);
    }
  }
);

router.delete("/:id", requireRole("customer", "admin"), async (req, res, next) => {
  try {
    const options = {};
    if (req.user.role === "customer") options.customerId = req.user.sub;
    const request = await db.cancelCargoRequest(req.params.id, req.user.sub, options);
    if (!request) return res.status(404).json({ message: "Cargo request not found" });
    req.app.get("io").emit("order.cancelled", request);
    void sendCargoRequestEventSms(request, "booking.cancelled").catch((error) => console.error("Cancelled SMS failed:", error.message));
    res.json(request);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/restore", requireRole("customer", "admin"), async (req, res, next) => {
  try {
    const options = {};
    if (req.user.role === "customer") options.customerId = req.user.sub;
    const result = await db.restoreCargoRequest(req.params.id, req.user.sub, options);
    if (!result) return res.status(404).json({ message: "Cargo request not found" });
    req.app.get("io").emit("order.restored", result.request);
    emitUserNotification(req.app.get("io"), result.notification);
    void sendCargoRequestEventSms(result.request, "booking.restored").catch((error) => console.error("Restored SMS failed:", error.message));
    res.json(result.request);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/image",
  requireRole("customer", "admin"),
  upload.single("cargoImage"),
  async (req, res, next) => {
    try {
      const request = await db.getCargoRequestById(req.params.id);
      if (!request) return res.status(404).json({ message: "Cargo request not found" });
      if (req.user.role === "customer" && request.customerId !== req.user.sub) {
        return res.status(403).json({ message: "Not allowed" });
      }
      if (!req.file) return res.status(400).json({ message: "Image file is required" });
      const url = await persistUploadedFile(req.file, "cargo-images");
      const updated = await db.updateCargoImageUrl(req.params.id, url);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
