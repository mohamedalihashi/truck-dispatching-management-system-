import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";

const router = Router();

const truckSchema = z.object({
  truckNumber: z.string().min(1).optional(),
  plateNumber: z.string().min(1),
  capacity: z.string().min(1),
  truckType: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  region: z.string().trim().min(1),
  city: z.string().trim().min(1),
  driverId: z.string().uuid(),
  status: z.enum(["Available", "Busy", "Maintenance"]).default("Available")
});

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get("/", requireRole("admin", "driver"), async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    };
    if (req.user.role === "driver") {
      filters.driverId = req.user.sub;
    }
    const result = await db.listTrucks(filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/summary", requireRole("admin", "driver"), async (req, res, next) => {
  try {
    if (req.user.role === "driver") {
      const result = await db.listTrucks({ driverId: req.user.sub, limit: 5 });
      const mine = result.data?.[0];
      res.json({
        total: result.total || 0,
        active: mine?.status === "Available" ? 1 : 0,
        busy: mine?.status === "Busy" ? 1 : 0,
        maintenance: mine?.status === "Maintenance" ? 1 : 0,
        inactive: 0,
      });
      return;
    }
    res.json(await db.truckSummary());
  } catch (error) {
    next(error);
  }
});

router.get("/live", requireRole("admin"), async (req, res, next) => {
  try {
    const result = await db.listLiveFleet({
      search: req.query.search,
      gpsStatus: req.query.gpsStatus,
      io: req.app.get("io"),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/geofences", requireRole("admin"), async (_req, res, next) => {
  try {
    res.json({ data: await db.listGeofences() });
  } catch (error) {
    next(error);
  }
});

router.post("/geofences", requireRole("admin"), async (req, res, next) => {
  try {
    const { name, zoneType, centerLat, centerLng, radiusM, active } = req.body || {};
    if (!name || !Number.isFinite(Number(centerLat)) || !Number.isFinite(Number(centerLng))) {
      return res.status(400).json({ message: "name, centerLat, centerLng are required" });
    }
    const radius = Number(radiusM);
    if (!(radius > 0)) {
      return res.status(400).json({ message: "radiusM must be > 0" });
    }
    const fence = await db.createGeofence(
      { name, zoneType, centerLat, centerLng, radiusM: radius, active },
      req.user.sub
    );
    res.status(201).json(fence);
  } catch (error) {
    next(error);
  }
});

router.delete("/geofences/:id", requireRole("admin"), async (req, res, next) => {
  try {
    await db.deleteGeofence(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.use(requirePermission("trucks"));

router.post("/", requireRole("admin"), validate(truckSchema), async (req, res, next) => {
  try {
    if (!req.body.truckType && !req.body.type) {
      return res.status(400).json({ message: "truckType is required" });
    }
    const truck = await db.createTruck(req.body);
    res.status(201).json(truck);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("admin", "driver"), async (req, res, next) => {
  try {
    const options = req.user.role === "driver" ? { driverId: req.user.sub } : {};
    const truck = await db.updateTruck(req.params.id, req.body, options);
    if (!truck) return res.status(404).json({ message: "Truck not found" });
    res.json(truck);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const ok = await db.deleteTruck(req.params.id);
    if (!ok) return res.status(404).json({ message: "Truck not found" });
    res.json({ message: "Truck deleted" });
  } catch (error) {
    next(error);
  }
});

export default router;
