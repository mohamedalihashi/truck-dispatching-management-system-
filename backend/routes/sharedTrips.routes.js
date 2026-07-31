import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";
import { formatSomaliaLocation } from "../lib/somaliaLocations.js";
import { normalizeSomaliPhone } from "../lib/phone.js";
import { sendBookingCreatedSms } from "../services/cargoSmsService.js";

const router = Router();

const sharedTripSchema = z.object({
  pickup: z.string().trim().min(1),
  destination: z.string().trim().min(1),
  fromRegion: z.string().trim().optional(),
  fromDistrict: z.string().trim().optional(),
  toRegion: z.string().trim().optional(),
  toDistrict: z.string().trim().optional(),
  departureDate: z.string().min(1),
  durationAmount: z.coerce.number().positive(),
  durationUnit: z.enum(["hours", "days"]),
  // Capacity is taken from the driver's registered truck on the server
  totalCapacityTons: z.coerce.number().positive().optional(),
  pricePerTon: z.coerce.number().positive(),
  notes: z.string().trim().max(500).optional(),
});

const bookSharedSchema = z.object({
  customerId: z.string().uuid().optional(),
  weightTons: z.coerce.number().positive(),
  description: z.string().trim().min(1),
  customerRole: z.enum(["SENDER", "RECEIVER"]).optional(),
  fromNeighborhood: z.string().trim().optional(),
  toNeighborhood: z.string().trim().optional(),
  senderName: z.string().trim().optional(),
  senderPhone: z.string().trim().optional(),
  receiverName: z.string().trim().optional(),
  receiverPhone: z.string().trim().optional(),
});

router.get("/public", async (req, res, next) => {
  try {
    res.json(
      await db.listSharedTrips({
        publicOnly: true,
        search: req.query.search,
        page: req.query.page,
        limit: req.query.limit,
      })
    );
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get("/summary", requireRole("driver", "admin"), async (req, res, next) => {
  try {
    const driverId = req.user.role === "driver" ? req.user.sub : req.query.driverId;
    res.json(await db.sharedTripsSummary({ driverId }));
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(
      await db.listSharedTrips({
        driverId: req.user.sub,
        status: req.query.status,
        search: req.query.search,
        page: req.query.page,
        limit: req.query.limit,
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/", requireRole("driver", "admin", "customer"), async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      publicOnly: req.user.role === "customer",
    };
    if (req.user.role === "driver") filters.driverId = req.user.sub;
    res.json(await db.listSharedTrips(filters));
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireRole("driver", "admin", "customer"), async (req, res, next) => {
  try {
    const trip = await db.getSharedTripById(req.params.id);
    if (!trip) return res.status(404).json({ message: "Shared trip not found" });
    res.json(trip);
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("driver"), validate(sharedTripSchema), async (req, res, next) => {
  try {
    const trip = await db.createSharedTrip({ ...req.body, driverId: req.user.sub });
    res.status(201).json(trip);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("driver"), validate(sharedTripSchema.partial()), async (req, res, next) => {
  try {
    res.json(await db.updateSharedTrip(req.params.id, req.user.sub, req.body));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/publish", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(await db.publishSharedTrip(req.params.id, req.user.sub));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/cancel", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(await db.cancelSharedTrip(req.params.id, req.user.sub));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/pickup", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(await db.startSharedTripPickup(req.params.id, req.user.sub));
  } catch (error) {
    next(error);
  }
});

/** @deprecated Prefer POST /:id/pickup */
router.post("/:id/depart", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(await db.startSharedTripPickup(req.params.id, req.user.sub));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/in-transit", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(await db.markSharedTripInTransit(req.params.id, req.user.sub));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/deliver", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(await db.markSharedTripDelivered(req.params.id, req.user.sub));
  } catch (error) {
    next(error);
  }
});

/** @deprecated Prefer POST /:id/deliver */
router.post("/:id/complete", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(await db.markSharedTripDelivered(req.params.id, req.user.sub));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/book", requireRole("customer", "admin"), validate(bookSharedSchema), async (req, res, next) => {
  try {
    const customerId = req.user.role === "admin" ? req.body.customerId : req.user.sub;
    if (!customerId) {
      return res.status(400).json({ message: "customerId is required" });
    }
    const customer = await db.findUserById(customerId);
    if (!customer || customer.role !== "customer") {
      return res.status(400).json({ message: "Valid customer is required" });
    }
    const trip = await db.getSharedTripById(req.params.id);
    if (!trip) return res.status(404).json({ message: "Shared trip not found" });

    const payload = {
      sharedTripId: req.params.id,
      customerId,
      customerName: customer?.name,
      weightTons: req.body.weightTons,
      description: req.body.description,
      customerRole: req.body.customerRole,
      pickup: trip.pickup,
      destination: trip.destination,
      fromRegion: trip.fromRegion,
      fromDistrict: trip.fromDistrict,
      toRegion: trip.toRegion,
      toDistrict: trip.toDistrict,
      fromNeighborhood: req.body.fromNeighborhood,
      toNeighborhood: req.body.toNeighborhood,
      senderName: req.body.senderName,
      receiverName: req.body.receiverName,
      senderPhone: req.body.senderPhone ? normalizeSomaliPhone(req.body.senderPhone) : undefined,
      receiverPhone: req.body.receiverPhone ? normalizeSomaliPhone(req.body.receiverPhone) : undefined,
    };

    if (req.body.customerRole === "SENDER") {
      payload.senderName = customer.name;
      payload.senderPhone = customer.phone;
    }
    if (req.body.customerRole === "RECEIVER") {
      payload.receiverName = customer.name;
      payload.receiverPhone = customer.phone;
    }

    const request = await db.bookSharedCapacity(payload);
    void sendBookingCreatedSms(request).catch((error) => console.error("Booking SMS failed:", error.message));
    req.app.get("io").emit("order.created", request);
    res.status(201).json(request);
  } catch (error) {
    next(error);
  }
});

export default router;
