import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";

const router = Router();
router.use(requireAuth, requirePasswordChanged);

const adjustSchema = z.object({
  adjustmentType: z.enum(["Increase", "Discount", "Fixed"]).optional().nullable(),
  adjustmentAmount: z.coerce.number().nonnegative().optional().nullable(),
  adjustmentReason: z.string().trim().max(500).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.adjustmentType && (data.adjustmentAmount == null || Number.isNaN(Number(data.adjustmentAmount)))) {
    ctx.addIssue({ code: "custom", path: ["adjustmentAmount"], message: "Adjustment amount is required" });
  }
});

function mapQuoteStatus(request) {
  const status = request.status;
  if (status === "Awaiting Approval") return "Waiting for Approval";
  if (status === "Quote Rejected") return "Rejected";
  if (status === "Approved" || status === "Assigned" || status === "Accepted") {
    return request.paymentStatus === "Paid" || request.paymentStatus === "Partial" ? "Paid" : "Accepted";
  }
  if (["In Transit", "Loaded", "Arrived Pickup", "Delivered"].includes(status)) {
    return request.paymentStatus === "Paid" ? "Paid" : "Accepted";
  }
  return status;
}

function toQuotePayload(request, extras = {}) {
  return {
    id: request.id,
    cargoRequestId: request.id,
    pickup: request.pickup,
    destination: request.destination,
    distanceKm: request.distanceKm,
    weight: request.weight,
    calculatedPrice: request.calculatedPrice,
    adjustmentType: request.adjustmentType,
    adjustmentAmount: request.adjustmentAmount,
    adjustmentReason: request.adjustmentReason,
    finalPrice: request.finalPrice ?? request.quotedPrice,
    quotedPrice: request.quotedPrice,
    quotedEstimatedTime: request.quotedEstimatedTime,
    quoteNotes: request.quoteNotes,
    status: request.status,
    quoteStatus: mapQuoteStatus({ ...request, ...extras }),
    approvedByDispatcher: request.approvedByDispatcher,
    approvedAt: request.approvedAt,
    customer: request.customer,
    driver: request.driver,
    truck: request.truck,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    ...extras,
  };
}

router.post("/:id/calculate", requireRole("admin", "dispatcher"), async (req, res, next) => {
  try {
    const result = await db.calculateQuotePrice(req.params.id, {
      actorId: req.user.sub,
      force: true,
    });
    if (!result) return res.status(404).json({ message: "Quote not found" });
    res.json({
      quote: toQuotePayload(result.request),
      calculation: result.calculation,
      settings: result.settings,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/adjust-price", requireRole("admin", "dispatcher"), validate(adjustSchema), async (req, res, next) => {
  try {
    const type = req.body.adjustmentType || null;
    const request = await db.adjustQuotePrice(req.params.id, {
      adjustmentType: type,
      adjustmentAmount: type ? req.body.adjustmentAmount : 0,
      adjustmentReason: req.body.adjustmentReason,
      actorId: req.user.sub,
    });
    if (!request) return res.status(404).json({ message: "Quote not found" });
    res.json(toQuotePayload(request));
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const request = await db.getCargoRequestById(req.params.id);
    if (!request) return res.status(404).json({ message: "Quote not found" });

    if (req.user.role === "customer" && request.customerId !== req.user.sub) {
      return res.status(403).json({ message: "Not allowed to view this quote" });
    }

    let paymentStatus = null;
    let paymentId = null;
    const trips = await db.listTrips({ customerId: request.customerId, limit: 50 });
    const trip = trips.data.find((row) => row.cargoRequestId === request.id);
    if (trip) {
      const payments = await db.listPayments({ customerId: request.customerId, limit: 50 });
      const payment = payments.data.find((row) => row.tripId === trip.id);
      if (payment) {
        paymentStatus = payment.status;
        paymentId = payment.id;
      }
    }

    res.json(toQuotePayload(request, { paymentStatus, paymentId, tripId: trip?.id || null }));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/accept", requireRole("customer"), async (req, res, next) => {
  try {
    const request = await db.acceptCargoQuote(req.params.id, { customerId: req.user.sub });
    if (!request) return res.status(404).json({ message: "Quote not found" });
    req.app.get("io").emit("quote.accepted", request);
    res.json(toQuotePayload(request, { quoteStatus: "Accepted" }));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/reject", requireRole("customer"), async (req, res, next) => {
  try {
    const request = await db.rejectCargoQuote(req.params.id, {
      customerId: req.user.sub,
      note: req.body?.note,
    });
    if (!request) return res.status(404).json({ message: "Quote not found" });
    req.app.get("io").emit("quote.rejected", request);
    res.json(toQuotePayload(request, { quoteStatus: "Rejected" }));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/pay", requireRole("customer"), async (req, res, next) => {
  try {
    const list = await db.listCargoRequests({ customerId: req.user.sub, limit: 100 });
    const request = list.data.find((row) => row.id === req.params.id);
    if (!request) return res.status(404).json({ message: "Quote not found" });

    if (!["Approved", "Assigned", "Accepted", "Arrived Pickup", "Loaded", "In Transit", "Delivered"].includes(request.status)) {
      return res.status(400).json({ message: "A driver must be assigned before payment" });
    }

    const trips = await db.listTrips({ customerId: req.user.sub, limit: 100 });
    const trip = trips.data.find((row) => row.cargoRequestId === request.id);
    if (!trip) return res.status(400).json({ message: "Trip not ready for payment yet" });

    const payments = await db.listPayments({ customerId: req.user.sub, limit: 100 });
    let payment = payments.data.find((row) => row.tripId === trip.id);
    if (!payment) {
      payment = await db.createPayment({
        tripId: trip.id,
        customerId: req.user.sub,
        amount: request.finalPrice ?? request.quotedPrice ?? trip.fare,
        status: "Pending",
        method: "waafipay",
        description: `Shipment ${trip.id} — 30% deposit then balance after delivery`,
      });
    }

    res.json({
      quote: toQuotePayload(request, { paymentStatus: payment.status, paymentId: payment.id, tripId: trip.id }),
      payment,
      payPath: "/customer/payments",
      message: "Open Payments to complete WaafiPay checkout for this quote.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
