import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";

const router = Router();

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
    const trip = await db.getSharedTripById(req.params.id, {
      includeDriverPhone: req.user.role === "admin",
      includeCustomerPhone: req.user.role === "admin",
    });
    if (!trip) return res.status(404).json({ message: "Shared trip not found" });
    if (req.user.role === "driver" && trip.driverId !== req.user.sub) {
      return res.status(403).json({ message: "Not allowed to view this shared trip" });
    }
    res.json(trip);
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("driver"), async (_req, res) => {
  res.status(403).json({
    message: "Drivers cannot announce shared routes. Admin assigns SHARED loads from Shared Loads.",
  });
});

/** Admin: assign multiple SHARED cargo requests onto one SHARED truck (creates SharedTrip + bookings). */
const assignPoolSchema = z.object({
  cargoRequestIds: z.array(z.string().trim().min(1)).min(2),
  truckId: z.string().trim().min(1),
  driverId: z.string().uuid(),
  fare: z.coerce.number().positive().optional(),
  estimatedTime: z.string().trim().max(100).optional(),
});

router.post("/assign-pool", requireRole("admin"), validate(assignPoolSchema), async (req, res, next) => {
  try {
    const result = await db.assignSharedLoadsToTruck({
      cargoRequestIds: req.body.cargoRequestIds,
      truckId: req.body.truckId,
      driverId: req.body.driverId,
      dispatcherId: req.user.sub,
      fare: req.body.fare,
      estimatedTime: req.body.estimatedTime,
    });
    const io = req.app.get("io");
    if (io && result?.sharedTrip) {
      io.emit("shared.pool.assigned", result);
      for (const booking of result.bookings || []) {
        if (booking.tripId) io.emit("trip.updated", { id: booking.tripId });
      }
    }
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("driver"), async (_req, res) => {
  res.status(403).json({
    message: "Drivers cannot edit shared trip announcements. Run the loads admin assigned to you.",
  });
});

router.post("/:id/publish", requireRole("driver"), async (_req, res) => {
  res.status(403).json({
    message: "Drivers cannot publish shared routes. Admin assigns SHARED loads from Shared Loads.",
  });
});

router.post("/:id/cancel", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(await db.cancelSharedTrip(req.params.id, req.user.sub));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/accept", requireRole("driver"), async (req, res, next) => {
  try {
    const trip = await db.acceptSharedTrip(req.params.id, req.user.sub);
    req.app.get("io")?.emit("shared.trip.updated", trip);
    res.json(trip);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/reject", requireRole("driver"), async (req, res, next) => {
  try {
    const trip = await db.rejectSharedTrip(req.params.id, req.user.sub);
    req.app.get("io")?.emit("shared.trip.updated", trip);
    res.json(trip);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/pickup", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(
      await db.startSharedTripPickup(req.params.id, req.user.sub, {
        weightsByBookingId: req.body?.weightsByBookingId || {},
      })
    );
  } catch (error) {
    next(error);
  }
});

/** @deprecated Prefer POST /:id/pickup */
router.post("/:id/depart", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(
      await db.startSharedTripPickup(req.params.id, req.user.sub, {
        weightsByBookingId: req.body?.weightsByBookingId || {},
      })
    );
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

router.patch("/:id/stops", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(
      await db.reorderSharedTripStops(req.params.id, req.user.sub, {
        pickupOrder: req.body?.pickupOrder || [],
        deliveryOrder: req.body?.deliveryOrder || [],
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post("/:id/bookings/:bookingId/deliver", requireRole("driver"), async (req, res, next) => {
  try {
    const trip = await db.markSharedBookingDelivered(
      req.params.id,
      req.params.bookingId,
      req.user.sub
    );
    req.app.get("io")?.emit("trip.status.updated", { tripId: req.params.bookingId });
    res.json(trip);
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

router.post("/:id/book", requireRole("customer", "admin"), async (_req, res) => {
  res.status(403).json({
    message:
      "Direct booking on announced shared trips is disabled. Submit a SHARED request from Shared booking; admin assigns the truck.",
  });
});

export default router;
