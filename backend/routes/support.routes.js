import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";

const router = Router();

const createSchema = z.object({
  againstRole: z.enum(["driver", "dispatcher"]),
  referenceId: z.string().trim().min(3).max(80),
  subject: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10).max(2000)
});

const statusSchema = z.object({
  status: z.enum(["Open", "In Review", "Resolved", "Closed"]),
  adminNote: z.string().trim().max(1000).optional()
});

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get("/contact", async (_req, res, next) => {
  try {
    res.json(await db.getSupportContact());
  } catch (error) {
    next(error);
  }
});

router.get("/", requireRole("admin", "customer"), async (req, res, next) => {
  try {
    const customerId = req.user.role === "customer" ? req.user.sub : req.query.customerId;
    res.json(
      await db.listSupportComplaints({
        customerId,
        status: req.query.status,
        page: req.query.page,
        limit: req.query.limit || 50
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("customer"), validate(createSchema), async (req, res, next) => {
  try {
    const complaint = await db.createSupportComplaint({
      customerId: req.user.sub,
      againstRole: req.body.againstRole,
      referenceId: req.body.referenceId,
      subject: req.body.subject,
      message: req.body.message,
      actorId: req.user.sub
    });
    req.app.get("io")?.emit("support.complaint.created", complaint);
    res.status(201).json(complaint);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", requireRole("admin"), validate(statusSchema), async (req, res, next) => {
  try {
    const complaint = await db.updateSupportComplaintStatus(req.params.id, {
      status: req.body.status,
      adminNote: req.body.adminNote,
      actorId: req.user.sub
    });
    if (!complaint) return res.status(404).json({ message: "Complaint not found" });
    res.json(complaint);
  } catch (error) {
    next(error);
  }
});

export default router;
