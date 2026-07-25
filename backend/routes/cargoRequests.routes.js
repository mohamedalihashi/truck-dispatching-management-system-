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

const router = Router();

const requiredName = z.string().trim().min(1, "Name cannot be empty");
const bookingPhone = z.string().trim().refine(isValidBookingPhone, "Enter a valid phone number (at least 7 digits)");
const emptyToUndefined = (value) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalName = z.preprocess(emptyToUndefined, requiredName.optional());
const optionalPhone = z.preprocess(emptyToUndefined, bookingPhone.optional());
const optionalText = z.preprocess(emptyToUndefined, z.string().trim().min(1).optional());

const cargoRequestFields = z.object({
  pickup: z.string().trim().min(1).optional(),
  destination: z.string().trim().min(1).optional(),
  truckType: z.string().trim().min(1),
  weight: z.string().trim().refine(
    (value) => Number.parseFloat(value) > 0,
    "Cargo weight must be a positive number"
  ),
  description: z.string().trim().min(1),
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
  customerId: z.string().uuid().optional()
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
  quotedPrice: z.coerce.number().positive().optional(),
  quotedEstimatedTime: z.string().min(1),
  quoteNotes: z.string().optional(),
  driverId: z.string().uuid().optional()
});

const rejectQuoteSchema = z.object({
  note: z.string().optional()
});

router.use(requireAuth);
router.use(requirePasswordChanged);
router.use(requirePermission("requests"));

router.get("/", async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit
    };
    if (req.user.role === "customer") filters.customerId = req.user.sub;
    if (req.user.role === "driver") filters.statuses = ["Pending"];
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
    if (req.user.role === "driver") filters.statuses = ["Pending"];
    res.json(await db.cargoRequestSummary(filters));
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("customer", "admin", "dispatcher"), validate(cargoRequestSchema), async (req, res, next) => {
  try {
    let customerId = req.user.sub;
    if (req.user.role === "dispatcher" || req.user.role === "admin") {
      if (!req.body.customerId) {
        return res.status(400).json({ message: "customerId is required" });
      }
      customerId = req.body.customerId;
    }
    const customer = await db.findUserById(customerId);
    if (!customer || customer.role !== "customer") {
      return res.status(400).json({ message: "Valid customer is required" });
    }
    if (req.user.role === "dispatcher") {
      const allowed = await db.isCustomerVisibleToDispatcher(customerId, req.user.sub);
      if (!allowed) {
        return res.status(403).json({ message: "You can only create requests for customers you registered or assigned" });
      }
    }
    if (req.user.role === "customer" && !req.body.customerRole) {
      return res.status(400).json({ message: "Customer role is required" });
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
      dispatcherId: req.user.role === "dispatcher" ? req.user.sub : undefined
    });
    req.app.get("io").emit("order.created", request);
    if (notification) req.app.get("io").emit("notification.created", notification);
    void sendBookingCreatedSms(request).catch((error) => console.error("Booking SMS failed:", error.message));
    res.status(201).json(request);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("customer", "admin", "dispatcher"), validate(updateCargoRequestSchema), async (req, res, next) => {
  try {
    const filters = {};
    if (req.user.role === "customer") filters.customerId = req.user.sub;
    let payload = req.body;
    if (req.user.role === "customer" && req.body.customerRole) {
      const customer = await db.findUserById(req.user.sub);
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
  requireRole("driver", "dispatcher", "admin"),
  validate(quoteSchema),
  async (req, res, next) => {
    try {
      const result = await db.submitCargoQuote(req.params.id, {
        quotedPrice: req.body.quotedPrice,
        quotedEstimatedTime: req.body.quotedEstimatedTime,
        quoteNotes: req.body.quoteNotes,
        driverId: req.user.role === "driver" ? req.user.sub : req.body.driverId,
        dispatcherId: ["dispatcher", "admin"].includes(req.user.role) ? req.user.sub : undefined
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

router.patch(
  "/:id/assign",
  requireRole("admin", "dispatcher"),
  validate(assignSchema),
  async (req, res, next) => {
    try {
      const result = await db.assignCargoRequest(req.params.id, {
        driverId: req.body.driverId,
        truckId: req.body.truckId,
        dispatcherId: req.user.role === "dispatcher" ? req.user.sub : req.body.dispatcherId || req.user.sub
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

router.delete("/:id", requireRole("customer", "dispatcher", "admin"), async (req, res, next) => {
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

router.post("/:id/restore", requireRole("customer", "dispatcher", "admin"), async (req, res, next) => {
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

export default router;
