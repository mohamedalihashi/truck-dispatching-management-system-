import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";
import {
  formatSomaliaLocation,
  isValidSomaliaDistrict,
  isValidSomaliaRegion
} from "../lib/somaliaLocations.js";
import { normalizeSomaliPhone, isValidBookingPhone } from "../lib/phone.js";
import { sendBookingCreatedSms, sendCargoRequestEventSms } from "../services/cargoSmsService.js";
import { upload } from "../lib/uploads.js";
import { persistUploadedFile } from "../lib/persistUpload.js";

const router = Router();

const requiredName = z.string().trim().min(1, "Name cannot be empty").max(100);
const bookingPhone = z.string().trim().max(20).refine(isValidBookingPhone, "Enter a valid phone number (at least 7 digits)");
const emptyToUndefined = (value) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalName = z.preprocess(emptyToUndefined, requiredName.optional());
const optionalPhone = z.preprocess(emptyToUndefined, bookingPhone.optional());
const optionalText = z.preprocess(emptyToUndefined, z.string().trim().min(1).optional());

const cargoRequestFields = z.object({
  pickup: z.string().trim().min(1).max(255).optional(),
  destination: z.string().trim().min(1).max(255).optional(),
  truckType: z.string().trim().min(1).max(100),
  weight: z.string().trim().refine(
    (value) => Number.parseFloat(value) > 0,
    "Cargo weight must be a positive number"
  ),
  description: z.string().trim().min(1).max(1000),
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
  loadType: z.enum(["FTL", "SHARED"]).optional(),
  openForBids: z.coerce.boolean().optional()
});

function validateStructuredBooking(data, ctx, { allowLegacy = true } = {}) {
  const usesStructuredLocations = Boolean(
    data.customerRole || data.fromRegion || data.fromDistrict || data.fromNeighborhood ||
    data.toRegion || data.toDistrict || data.toNeighborhood
  );

  if (!usesStructuredLocations && allowLegacy) {
    if (!data.pickup) ctx.addIssue({ code: "custom", path: ["pickup"], message: "Pickup is required" });
    if (!data.destination) ctx.addIssue({ code: "custom", path: ["destination"], message: "Destination is required" });
    return;
  }

  if (!data.customerRole) {
    ctx.addIssue({ code: "custom", path: ["customerRole"], message: "Customer role is required" });
  }
  if (!isValidSomaliaRegion(data.fromRegion)) {
    ctx.addIssue({ code: "custom", path: ["fromRegion"], message: "Select a valid Somalia region" });
  } else if (!isValidSomaliaDistrict(data.fromRegion, data.fromDistrict)) {
    ctx.addIssue({ code: "custom", path: ["fromDistrict"], message: "District does not belong to the selected region" });
  }
  if (!isValidSomaliaRegion(data.toRegion)) {
    ctx.addIssue({ code: "custom", path: ["toRegion"], message: "Select a valid Somalia region" });
  } else if (!isValidSomaliaDistrict(data.toRegion, data.toDistrict)) {
    ctx.addIssue({ code: "custom", path: ["toDistrict"], message: "District does not belong to the selected region" });
  }
  if (!data.fromNeighborhood) {
    ctx.addIssue({ code: "custom", path: ["fromNeighborhood"], message: "From neighborhood is required" });
  }
  if (!data.toNeighborhood) {
    ctx.addIssue({ code: "custom", path: ["toNeighborhood"], message: "To neighborhood is required" });
  }
  if (data.customerRole === "SENDER") {
    if (!data.receiverName) ctx.addIssue({ code: "custom", path: ["receiverName"], message: "Receiver name is required" });
    if (!data.receiverPhone) ctx.addIssue({ code: "custom", path: ["receiverPhone"], message: "Receiver phone is required" });
  }
  if (data.customerRole === "RECEIVER") {
    if (!data.senderName) ctx.addIssue({ code: "custom", path: ["senderName"], message: "Sender name is required" });
    if (!data.senderPhone) ctx.addIssue({ code: "custom", path: ["senderPhone"], message: "Sender phone is required" });
  }
}

export const cargoRequestSchema = cargoRequestFields.superRefine((data, ctx) => {
  validateStructuredBooking(data, ctx);
});

const updateCargoRequestSchema = cargoRequestFields.partial().superRefine((data, ctx) => {
  const updatesStructuredBooking = Boolean(
    data.customerRole || data.fromRegion || data.fromDistrict || data.fromNeighborhood ||
    data.toRegion || data.toDistrict || data.toNeighborhood
  );
  if (updatesStructuredBooking) validateStructuredBooking(data, ctx, { allowLegacy: false });
});

const assignSchema = z.object({
  driverId: z.string().uuid(),
  truckId: z.string().uuid(),
  dispatcherId: z.string().uuid().optional()
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

const phoneBookingSchema = z.object({
  customerId: z.string().uuid(),
  loadType: z.enum(["FTL", "SHARED"]),
  pickupContactName: z.string().trim().min(2).max(100),
  pickupContactPhone: bookingPhone,
  pickup: z.string().trim().min(2).max(255),
  destinationContactName: z.string().trim().min(2).max(100),
  destinationContactPhone: bookingPhone,
  destination: z.string().trim().min(2).max(255),
  truckType: z.string().trim().max(100).optional(),
  weight: z.string().trim().refine((value) => Number.parseFloat(value) > 0, "Weight must be positive"),
  description: z.string().trim().min(2).max(1000),
});

const phoneAssignmentSchema = z.object({
  truckId: z.string().uuid().optional(),
  sharedTripId: z.string().min(1).optional(),
});

router.use(requireAuth);
router.use(requirePasswordChanged);
router.use(requirePermission("requests"));

router.post("/phone-assisted", requireRole("admin"), validate(phoneBookingSchema), async (req, res, next) => {
  try {
    const booking = await db.createPhoneBooking(req.body, req.user.sub);
    req.app.get("io").emit("order.created", booking);
    void sendBookingCreatedSms(booking).catch((error) => console.error("Phone booking SMS failed:", error.message));
    res.status(201).json(booking);
  } catch (error) {
    next(error);
  }
});

router.get("/phone-assisted", requireRole("admin"), async (req, res, next) => {
  try {
    res.json(await db.listPhoneBookings(req.query));
  } catch (error) {
    next(error);
  }
});

router.get("/phone-assisted-options", requireRole("admin"), async (_req, res, next) => {
  try {
    res.json(await db.availablePhoneOptions());
  } catch (error) {
    next(error);
  }
});

router.get("/phone-assisted/:id/assignment-options", requireRole("admin"), async (req, res, next) => {
  try {
    const result = await db.phoneAssignmentOptions(req.params.id);
    if (!result) return res.status(404).json({ message: "Unassigned phone booking not found" });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/phone-assisted/:id/assign", requireRole("admin"), validate(phoneAssignmentSchema), async (req, res, next) => {
  try {
    const booking = await db.assignPhoneBooking(req.params.id, req.body, req.user.sub);
    if (!booking) return res.status(404).json({ message: "Unassigned phone booking not found" });
    req.app.get("io").emit("driver.assigned", booking);
    req.app.get("io").emit("notification.created", { userId: booking.driverId, type: "phone_booking.assigned" });
    void sendCargoRequestEventSms(booking, "booking.assigned")
      .catch((error) => console.error("Phone assignment SMS failed:", error.message));
    res.json(booking);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit
    };
    if (req.user.role === "customer") filters.customerId = req.user.sub;
    if (req.user.role === "driver") filters.driverId = req.user.sub;
    const result = await db.listCargoRequests(filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const filters = {};
    if (req.user.role === "customer") filters.customerId = req.user.sub;
    if (req.user.role === "driver") filters.driverId = req.user.sub;
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
      !req.body.openForBids
    ) {
      return res.status(400).json({
        message: "Select a truck to book, post an open FTL request for bids, or book a shared load."
      });
    }
    if (req.body.customerRole && (!customer.name?.trim() || !bookingPhone.safeParse(customer.phone).success)) {
      return res.status(400).json({ message: "Your profile name and phone number are required before booking" });
    }
    const bookingDetails = req.body.customerRole
      ? {
          ...req.body,
          pickup: formatSomaliaLocation(req.body.fromNeighborhood, req.body.fromDistrict, req.body.fromRegion),
          destination: formatSomaliaLocation(req.body.toNeighborhood, req.body.toDistrict, req.body.toRegion),
          senderName: req.body.customerRole === "SENDER" ? customer.name.trim() : req.body.senderName.trim(),
          senderPhone: normalizeSomaliPhone(req.body.customerRole === "SENDER" ? customer.phone : req.body.senderPhone),
          receiverName: req.body.customerRole === "RECEIVER" ? customer.name.trim() : req.body.receiverName.trim(),
          receiverPhone: normalizeSomaliPhone(req.body.customerRole === "RECEIVER" ? customer.phone : req.body.receiverPhone)
        }
      : req.body;
    const { request, notification } = await db.createCargoRequest({
      ...bookingDetails,
      customerId,
      customerName: customer.name,
      preferredTruckId: req.body.preferredTruckId,
      loadType: req.body.loadType || (req.body.openForBids || req.body.preferredTruckId ? "FTL" : undefined)
    });
    req.app.get("io").emit("order.created", request);
    if (notification) req.app.get("io").emit("notification.created", notification);
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
    let payload = req.body;
    if (req.user.role === "customer" && req.body.customerRole) {
      const customer = await db.findBookingCustomerById(req.user.sub);
      if (!customer?.name?.trim() || !bookingPhone.safeParse(customer?.phone).success) {
        return res.status(400).json({ message: "Your profile name and phone number are required before booking" });
      }
      payload = {
        ...req.body,
        pickup: formatSomaliaLocation(req.body.fromNeighborhood, req.body.fromDistrict, req.body.fromRegion),
        destination: formatSomaliaLocation(req.body.toNeighborhood, req.body.toDistrict, req.body.toRegion),
        senderName: req.body.customerRole === "SENDER" ? customer.name.trim() : req.body.senderName?.trim(),
        senderPhone: normalizeSomaliPhone(req.body.customerRole === "SENDER" ? customer.phone : req.body.senderPhone),
        receiverName: req.body.customerRole === "RECEIVER" ? customer.name.trim() : req.body.receiverName?.trim(),
        receiverPhone: normalizeSomaliPhone(req.body.customerRole === "RECEIVER" ? customer.phone : req.body.receiverPhone)
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
  requireRole("driver", "admin"),
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
      if (result.notification) req.app.get("io").emit("notification.created", result.notification);
      res.json(result.request);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/:id/quote/accept",
  async (req, res, next) => {
    try {
      if (req.user.role !== "customer") {
        return res.status(403).json({ message: "Only the booking customer can accept a quotation" });
      }
      const request = await db.acceptCargoQuote(req.params.id, { customerId: req.user.sub });
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
        dispatcherId: req.body.dispatcherId
      });
      if (!result) return res.status(404).json({ message: "Cargo request not found" });
      req.app.get("io").emit("driver.assigned", result.request);
      if (result.notification) req.app.get("io").emit("notification.created", result.notification);
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
    if (result.notification) req.app.get("io").emit("notification.created", result.notification);
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
