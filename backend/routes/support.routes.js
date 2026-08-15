import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";
import { registrationLimiter } from "../middleware/security.js";

const router = Router();

const createSchema = z.object({
  againstRole: z.enum(["driver", "dispatcher", "platform"]).default("driver"),
  referenceId: z.string().trim().min(3).max(80).optional(),
  subject: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10).max(2000)
}).superRefine((data, ctx) => {
  if (data.againstRole !== "platform" && !data.referenceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["referenceId"],
      message: "Choose the trip this complaint is about"
    });
  }
});

const statusSchema = z.object({
  status: z.enum(["Open", "In Review", "Resolved", "Closed"]),
  adminNote: z.string().trim().max(1000).optional()
});

const contactMessageSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z
    .preprocess((v) => {
      if (v == null || String(v).trim() === "") return undefined;
      return String(v).trim().toLowerCase();
    }, z.string().email().max(254).optional()),
  phone: z.string().trim().min(7).max(40),
  message: z.string().trim().min(10).max(2000)
});

/** Public — used by Contact landing page (no login). */
router.get("/contact", async (_req, res, next) => {
  try {
    res.json(await db.getSupportContact());
  } catch (error) {
    next(error);
  }
});

/** Public — save Contact page “Send message” into DB. */
router.post("/messages", registrationLimiter, validate(contactMessageSchema), async (req, res, next) => {
  try {
    const saved = await db.createContactMessage(req.body);
    req.app.get("io")?.emit("support.contact.created", { id: saved.id });
    res.status(201).json({
      message: "Message received. Support will get back to you soon.",
      id: saved.id
    });
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get("/messages", requireRole("admin"), async (req, res, next) => {
  try {
    res.json(
      await db.listContactMessages({
        status: req.query.status,
        page: req.query.page,
        limit: req.query.limit || 50
      })
    );
  } catch (error) {
    next(error);
  }
});

router.patch("/messages/:id/status", requireRole("admin"), validate(statusSchema), async (req, res, next) => {
  try {
    const row = await db.updateContactMessageStatus(req.params.id, {
      status: req.body.status,
      adminNote: req.body.adminNote
    });
    if (!row) return res.status(404).json({ message: "Message not found" });
    res.json(row);
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
