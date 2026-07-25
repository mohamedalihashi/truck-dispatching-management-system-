import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";

const router = Router();
router.use(requireAuth, requirePasswordChanged);

const pricingSchema = z.object({
  baseFee: z.coerce.number().nonnegative(),
  pricePerKm: z.coerce.number().nonnegative(),
  pricePerTon: z.coerce.number().nonnegative(),
  minimumCharge: z.coerce.number().nonnegative(),
  maximumCharge: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.number().nonnegative().nullable().optional()
  ),
  automaticPricing: z.coerce.boolean(),
});

router.get("/", requireRole("admin", "dispatcher", "customer"), async (_req, res, next) => {
  try {
    res.json(await db.getPricingSettings());
  } catch (error) {
    next(error);
  }
});

const estimateSchema = z.object({
  pickup: z.string().min(1),
  destination: z.string().min(1),
  weight: z.union([z.string(), z.number()]),
});

router.post("/estimate", requireRole("admin", "dispatcher", "customer"), validate(estimateSchema), async (req, res, next) => {
  try {
    res.json(
      await db.estimateTransportPrice({
        pickup: req.body.pickup,
        destination: req.body.destination,
        weight: req.body.weight,
      })
    );
  } catch (error) {
    next(error);
  }
});

router.put("/", requireRole("admin"), requirePermission("settings"), validate(pricingSchema), async (req, res, next) => {
  try {
    res.json(await db.updatePricingSettings(req.body, { actorId: req.user.sub }));
  } catch (error) {
    next(error);
  }
});

export default router;
