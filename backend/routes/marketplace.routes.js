import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";

const router = Router();

const bidSchema = z.object({
  amount: z.coerce.number().positive(),
  estimatedDays: z.coerce.number().int().positive().optional(),
  notes: z.string().trim().max(500).optional()
});

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get("/ftl", requireRole("driver", "admin"), async (req, res, next) => {
  try {
    if (req.user.role === "driver") {
      const me = await db.findUserById(req.user.sub);
      if (me?.serviceType === "SHARED") {
        return res.status(403).json({ message: "FTL marketplace is only available to FTL drivers" });
      }
    }
    res.json(await db.listFtlMarketplace({
      search: req.query.search,
      region: req.query.region,
      truckType: req.query.truckType || req.query.type,
      page: req.query.page,
      limit: req.query.limit
    }));
  } catch (error) {
    next(error);
  }
});

router.get("/bids/me", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(await db.listBidsForDriver(req.user.sub, { status: req.query.status }));
  } catch (error) {
    next(error);
  }
});

router.get("/bids/request/:cargoRequestId", requireRole("customer", "admin", "driver"), async (req, res, next) => {
  try {
    res.json(await db.listBidsForRequest(req.params.cargoRequestId));
  } catch (error) {
    next(error);
  }
});

router.post("/bids/:cargoRequestId", requireRole("driver"), validate(bidSchema), async (req, res, next) => {
  try {
    const bid = await db.createBid({
      cargoRequestId: req.params.cargoRequestId,
      driverId: req.user.sub,
      amount: req.body.amount,
      estimatedDays: req.body.estimatedDays,
      notes: req.body.notes
    });
    res.status(201).json(bid);
  } catch (error) {
    next(error);
  }
});

router.patch("/bids/:id", requireRole("driver"), validate(bidSchema.partial()), async (req, res, next) => {
  try {
    res.json(await db.updateBid(req.params.id, req.user.sub, req.body));
  } catch (error) {
    next(error);
  }
});

router.post("/bids/:id/withdraw", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(await db.withdrawBid(req.params.id, req.user.sub));
  } catch (error) {
    next(error);
  }
});

router.post("/bids/:id/accept", requireRole("customer"), async (req, res, next) => {
  try {
    res.json(await db.acceptBid({ bidId: req.params.id, customerId: req.user.sub }));
  } catch (error) {
    next(error);
  }
});

export default router;
