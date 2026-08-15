import { Router } from "express";
import { db } from "../services/dbService.js";
import { getPublicTrackingByToken } from "../services/trackingLinkService.js";

const router = Router();

router.get("/testimonials", async (req, res, next) => {
  try {
    res.json(
      await db.listPublicTestimonials({
        limit: req.query.limit,
      })
    );
  } catch (error) {
    next(error);
  }
});

/** Public live trip tracking via secure share token (no login). */
router.get("/track/:token", async (req, res, next) => {
  try {
    const result = await getPublicTrackingByToken(req.params.token);
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    res.json(result.data);
  } catch (error) {
    next(error);
  }
});

export default router;
