import { Router } from "express";
import { requireAuth, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { db } from "../services/dbService.js";

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChanged);
router.use(requirePermission("notifications"));

router.get("/", async (req, res, next) => {
  try {
    const result = await db.listNotifications({
      userId: req.user.sub,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/read", async (req, res, next) => {
  try {
    const notification = await db.markNotificationRead(req.params.id, {
      userId: req.user.sub,
    });
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json(notification);
  } catch (error) {
    next(error);
  }
});

export default router;
