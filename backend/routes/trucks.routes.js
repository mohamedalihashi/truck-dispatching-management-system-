import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";

const router = Router();

const truckSchema = z.object({
  truckNumber: z.string().min(1),
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

// Dispatchers need truck lists to assign drivers even without full fleet admin access.
router.get("/", requireRole("admin", "dispatcher", "driver"), async (req, res, next) => {
  try {
    const result = await db.listTrucks({
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/summary", requireRole("admin", "dispatcher", "driver"), async (_req, res, next) => {
  try {
    res.json(await db.truckSummary());
  } catch (error) {
    next(error);
  }
});

router.use(requirePermission("trucks"));

router.get("/types", async (_req, res, next) => {
  try {
    res.json({ data: await db.listTruckTypes() });
  } catch (error) {
    next(error);
  }
});

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

router.patch("/:id", requireRole("admin", "dispatcher", "driver"), async (req, res, next) => {
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
