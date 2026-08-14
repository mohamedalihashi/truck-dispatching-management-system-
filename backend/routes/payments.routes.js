import { Router } from "express";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { db } from "../services/dbService.js";
import { getWaafiPublicConfig } from "../services/waafiPayService.js";
import { emitUserNotification } from "../lib/notifyRealtime.js";

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChanged);
router.use(requirePermission("payments"));

router.get("/waafi/config", requireRole("admin", "customer"), (_req, res) => {
  res.json(getWaafiPublicConfig());
});

router.patch("/:id", requireRole("customer"), async (req, res, next) => {
  try {
    const { amount, description } = req.body;
    const payment = await db.updateCustomerPayment({
      id: req.params.id,
      amount,
      description,
      customerId: req.user.sub,
    });
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

router.post("/waafi/purchase", requireRole("customer"), async (req, res, next) => {
  try {
    const { paymentId, accountNo, payAmount } = req.body;
    if (!paymentId || !accountNo) {
      return res.status(400).json({ message: "paymentId and accountNo are required" });
    }

    const result = await db.processWaafiPayment({
      paymentId,
      accountNo,
      payAmount,
      customerId: req.user.sub,
      actorId: req.user.sub,
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("payment.completed", result.payment);
      emitUserNotification(io, result.notification);
      for (const notification of result.adminNotifications || []) {
        emitUserNotification(io, notification);
      }
      if (result.earnings?.length) {
        io.emit("earnings.distributed", { paymentId, count: result.earnings.length });
      }
    }

    res.json(result.payment);
  } catch (error) {
    next(error);
  }
});

export default router;
