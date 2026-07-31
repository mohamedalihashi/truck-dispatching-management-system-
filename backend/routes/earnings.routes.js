import { Router } from "express";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { db } from "../services/dbService.js";
import { getCommissionSettings } from "../services/commissionService.js";

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChanged);
router.use(requirePermission("earnings"));

router.get("/commission", requireRole("admin", "driver"), async (_req, res) => {
  res.json(await getCommissionSettings());
});

router.get("/summary", requireRole("admin", "driver"), async (req, res, next) => {
  try {
    res.json(
      await db.getEarningsSummary({
        userId: req.user.sub,
        role: req.user.role,
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireRole("driver"), async (req, res, next) => {
  try {
    res.json(
      await db.listEarnings({
        recipientId: req.user.sub,
        status: req.query.status,
        page: req.query.page,
        limit: req.query.limit,
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/", requireRole("admin"), async (req, res, next) => {
  try {
    res.json(
      await db.listEarnings({
        recipientId: req.query.recipientId,
        recipientRole: req.query.role,
        status: req.query.status,
        page: req.query.page,
        limit: req.query.limit,
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post("/:id/payout", requireRole("admin"), async (req, res, next) => {
  try {
    const { payoutMethod, payoutReference } = req.body;
    const earning = await db.payoutEarning(req.params.id, {
      actorId: req.user.sub,
      payoutMethod: payoutMethod || "evc_manual",
      payoutReference,
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("earning.paid_out", earning);
      io.emit("payment.updated", { type: "earning" });
    }

    res.json(earning);
  } catch (error) {
    next(error);
  }
});

router.post("/user/:userId/payout-all", requireRole("admin"), async (req, res, next) => {
  try {
    const { payoutMethod, payoutReference } = req.body;
    const earnings = await db.payoutUserEarnings({
      userId: req.params.userId,
      actorId: req.user.sub,
      payoutMethod: payoutMethod || "evc_manual",
      payoutReference,
    });

    const io = req.app.get("io");
    if (io) {
      for (const earning of earnings) io.emit("earning.paid_out", earning);
      io.emit("payment.updated", { type: "earning" });
    }

    res.json({ data: earnings, count: earnings.length });
  } catch (error) {
    next(error);
  }
});

export default router;
