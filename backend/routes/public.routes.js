import { Router } from "express";
import { db } from "../services/dbService.js";

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

export default router;
