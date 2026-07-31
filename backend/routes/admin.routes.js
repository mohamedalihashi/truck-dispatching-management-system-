import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";
import { listSmsNotifications, resendSms, sendManualSms } from "../services/smsService.js";

const router = Router();

const sendSmsSchema = z.object({
  recipientPhone: z.string().trim().min(7),
  recipientName: z.string().trim().optional(),
  message: z.string().trim().min(1).max(1000)
});

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get("/payments", requireRole("admin", "customer"), requirePermission("payments"), async (req, res, next) => {
  try {
    const customerId = req.user.role === "customer" ? req.user.sub : undefined;
    res.json(
      await db.listPayments({
        page: req.query.page,
        limit: req.query.limit,
        customerId
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/settings", requireRole("admin"), requirePermission("settings"), async (_req, res, next) => {
  try {
    res.json(await db.getSettings());
  } catch (error) {
    next(error);
  }
});

router.put("/settings/rolePermissions", requireRole("admin"), requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await db.updateRolePermissions(req.body);
    await db.recordAudit({
      userId: req.user.sub,
      action: "settings.permissions.updated",
      entityType: "settings",
      entityId: "rolePermissions",
      description: "Role permissions updated",
      newValues: result.value,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.put("/settings/:key", requireRole("admin"), requirePermission("settings"), async (req, res, next) => {
  try {
    res.json(await db.updateSettings(req.params.key, req.body));
  } catch (error) {
    next(error);
  }
});

router.post("/payments", requireRole("admin"), requirePermission("payments"), async (req, res, next) => {
  try {
    const { tripId, customerId, amount, status, method, description } = req.body;
    if (!customerId || amount == null) {
      return res.status(400).json({ message: "customerId and amount are required" });
    }
    const payment = await db.createPayment({ tripId, customerId, amount, status, method, description });
    const io = req.app.get("io");
    if (io) io.emit("payment.updated", payment);
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});

router.delete("/payments/:id", requireRole("admin"), requirePermission("payments"), async (req, res, next) => {
  try {
    const ok = await db.deletePayment(req.params.id);
    if (!ok) return res.status(404).json({ message: "Payment not found" });
    res.json({ message: "Payment deleted" });
  } catch (error) {
    next(error);
  }
});

router.patch("/payments/:id", requireRole("admin"), requirePermission("payments"), async (req, res, next) => {
  try {
    const { status, amount, description, amountPaid, method } = req.body;
    if (!status && amount == null && description == null && amountPaid == null && !method) {
      return res.status(400).json({ message: "No payment fields to update" });
    }
    const payment = await db.updatePayment(req.params.id, {
      status,
      amount,
      description,
      amountPaid,
      method,
    });
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    const io = req.app.get("io");
    if (io) io.emit("payment.updated", payment);
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

router.get("/audit-logs", requireRole("admin"), requirePermission("auditLogs"), async (req, res, next) => {
  try {
    res.json(await db.listAuditLogs({ page: req.query.page, limit: req.query.limit }));
  } catch (error) {
    next(error);
  }
});

router.get("/sms-notifications", requireRole("admin"), requirePermission("notifications"), async (req, res, next) => {
  try {
    res.json(await listSmsNotifications({ status: req.query.status, page: req.query.page, limit: req.query.limit }));
  } catch (error) {
    next(error);
  }
});

router.post("/sms-notifications", requireRole("admin"), requirePermission("notifications"), validate(sendSmsSchema), async (req, res, next) => {
  try {
    const actor = await db.findUserById(req.user.sub);
    const result = await sendManualSms({
      recipientPhone: req.body.recipientPhone,
      recipientName: req.body.recipientName,
      message: req.body.message,
      sentByUserId: req.user.sub,
      sentByName: actor?.name || "Admin"
    });
    await db.recordAudit({
      userId: req.user.sub,
      action: "sms.manual.sent",
      entityType: "sms_notifications",
      entityId: result?.id,
      description: `Manual SMS to ${req.body.recipientPhone}`,
      newValues: { recipientPhone: req.body.recipientPhone, status: result?.status }
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/sms-notifications/:id/resend", requireRole("admin"), requirePermission("notifications"), async (req, res, next) => {
  try {
    res.json(await resendSms(req.params.id));
  } catch (error) {
    next(error);
  }
});

export default router;
