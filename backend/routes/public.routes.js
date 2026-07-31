import { Router } from "express";
import { db } from "../services/dbService.js";

const router = Router();

router.get("/trucks", async (req, res, next) => {
  try {
    res.json(
      await db.listPublicTrucks({
        region: req.query.region,
        city: req.query.city || req.query.district,
        truckType: req.query.truckType || req.query.type,
        search: req.query.search,
        page: req.query.page,
        limit: req.query.limit,
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/trucks/:id", async (req, res, next) => {
  try {
    const truck = await db.getPublicTruck(req.params.id);
    if (!truck) {
      return res.status(404).json({ message: "Truck not found" });
    }
    res.json(truck);
  } catch (error) {
    next(error);
  }
});

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
