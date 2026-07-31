import { Router } from "express";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { db } from "../services/dbService.js";

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChanged);

router.get("/dashboard", requirePermission("dashboard"), async (req, res, next) => {
  try {
    res.json(await db.dashboardStats({ role: req.user.role, userId: req.user.sub }));
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard-summary", requirePermission("dashboard"), async (req, res, next) => {
  try {
    res.json(await db.dashboardSummary({ role: req.user.role, userId: req.user.sub }));
  } catch (error) {
    next(error);
  }
});

router.get("/overview", requireRole("admin"), requirePermission("reports"), async (_req, res, next) => {
  try {
    res.json(await db.reportsOverview());
  } catch (error) {
    next(error);
  }
});

router.get("/trends", requireRole("admin"), requirePermission("reports"), async (req, res, next) => {
  try {
    res.json(await db.reportsTrends({ months: req.query.months || 6 }));
  } catch (error) {
    next(error);
  }
});

router.get("/operations", requireRole("admin"), requirePermission("reports"), async (_req, res, next) => {
  try {
    res.json(await db.reportsOperations());
  } catch (error) {
    next(error);
  }
});

router.get("/performance", requireRole("admin"), requirePermission("reports"), async (_req, res, next) => {
  try {
    res.json(await db.reportsPerformance());
  } catch (error) {
    next(error);
  }
});

router.get("/summary", requireRole("admin"), requirePermission("reports"), async (_req, res, next) => {
  try {
    res.json(await db.reportsSummary());
  } catch (error) {
    next(error);
  }
});

router.get("/user-activity", requireRole("admin"), requirePermission("reports"), async (req, res, next) => {
  try {
    if (!req.query.userId) {
      return res.status(400).json({ message: "Select a user to generate the activity report" });
    }
    const report = await db.userActivityReport({
      userId: req.query.userId,
      activityType: req.query.activityType || "all",
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      limit: req.query.limit || 200,
    });
    if (!report) return res.status(404).json({ message: "User not found" });
    res.json(report);
  } catch (error) {
    next(error);
  }
});

export default router;
