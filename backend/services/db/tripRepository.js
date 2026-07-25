import { prisma, withTransaction } from "../../lib/prisma.js";
import { estimateEta, shouldRecordPoint } from "../../lib/somaliaGeo.js";
import { auditFields } from "../../lib/auditContext.js";
import { buildWaafiReferenceId } from "../waafiPayService.js";
import { cargoStatusFromTripStatus, validateTripStatusChange } from "../../lib/tripStatus.js";
import { hasDepositPaid, TRIP_START_STATUSES } from "../../lib/paymentWorkflow.js";
import {
  mapTrip,
  mapFeedbackListItem,
  mapNotification,
  tripInclude,
  feedbackListInclude,
  tripStatusToDb,
  tripStatusToApi,
  reqStatusToDb,
} from "./mappers.js";

export const tripRepository = {
async listTrips({ status, driverId, customerId, search, page = 1, limit = 50 } = {}) {
  const where = {};
  if (status) where.status = tripStatusToDb(status);
  if (driverId) where.driverId = driverId;
  if (customerId) where.customerId = customerId;
  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { pickup: { contains: search, mode: "insensitive" } },
      { destination: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
      { driver: { name: { contains: search, mode: "insensitive" } } },
      { truck: { truckNumber: { contains: search, mode: "insensitive" } } },
      { truck: { plateNumber: { contains: search, mode: "insensitive" } } },
    ];
  }
  const offset = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    prisma.trip.findMany({
      where,
      include: tripInclude,
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: offset,
    }),
    prisma.trip.count({ where }),
  ]);
  return { data: data.map(mapTrip), total, page: Number(page) };
},

async tripSummary({ driverId, customerId } = {}) {
  const where = {};
  if (driverId) where.driverId = driverId;
  if (customerId) where.customerId = customerId;

  const activeStatuses = ["Assigned", "Accepted", "Arrived_Pickup", "Loaded", "In_Transit", "Delayed"];

  const [total, active, pending, cancelled, delivered] = await Promise.all([
    prisma.trip.count({ where }),
    prisma.trip.count({ where: { ...where, status: { in: activeStatuses } } }),
    prisma.trip.count({ where: { ...where, status: "Pending" } }),
    prisma.trip.count({ where: { ...where, status: "Cancelled" } }),
    prisma.trip.count({ where: { ...where, status: "Delivered" } }),
  ]);

  return { total, active, pending, cancelled, delivered };
},

async updateTripStatus(id, status, actorId, { driverId, role } = {}) {
  const existing = await prisma.trip.findUnique({ where: { id } });
  if (!existing) return null;
  if (driverId && existing.driverId !== driverId) {
    const error = new Error("Not allowed to update this trip");
    error.status = 403;
    throw error;
  }

  const currentStatus = tripStatusToApi(existing.status);
  const validation = validateTripStatusChange({
    currentStatus,
    nextStatus: status,
    role,
    hasDeliveryProof: Boolean(existing.deliveryProofUrl),
  });
  if (!validation.ok) {
    const error = new Error(validation.message);
    error.status = validation.status;
    throw error;
  }

  // Journey cannot start until the customer pays the 30% deposit.
  if (TRIP_START_STATUSES.includes(status)) {
    const payment = await prisma.payment.findFirst({
      where: { tripId: id },
      orderBy: { createdAt: "desc" },
    });
    if (!hasDepositPaid({ amount: payment?.amount, amountPaid: payment?.amountPaid, fare: existing.fare })) {
      const deposit = Math.round(Number(payment?.amount ?? existing.fare ?? 0) * 0.3 * 100) / 100;
      const error = new Error(
        `Customer must pay the 30% deposit (${deposit}) before the trip can start. Status stays Assigned until deposit is paid.`
      );
      error.status = 409;
      throw error;
    }
  }

  const dbStatus = tripStatusToDb(status);

  return withTransaction(async (tx) => {
    const trip = await tx.trip.update({
      where: { id },
      data: { status: dbStatus },
    }).catch(() => null);

    if (!trip) return null;

    // Sync cargo request status
    if (trip.cargoRequestId) {
      const requestStatus = cargoStatusFromTripStatus(status);
      const allowed = ["Pending", "Assigned", "Accepted", "Arrived Pickup", "Loaded", "In Transit", "Delivered", "Cancelled"];
      if (allowed.includes(requestStatus)) {
        await tx.cargoRequest.update({
          where: { id: trip.cargoRequestId },
          data: { status: reqStatusToDb(requestStatus) },
        });
      }
    }

    // Release truck & handle payment on terminal statuses
    if (status === "Delivered" || status === "Cancelled") {
      if (trip.truckId) {
        await tx.truck.update({
          where: { id: trip.truckId },
          data: { status: "Available" },
        });
      }
      if (status === "Delivered") {
        const existingPayment = await tx.payment.findFirst({
          where: { tripId: trip.id },
        });
        if (!existingPayment) {
          await tx.payment.create({
            data: {
              trip: { connect: { id: trip.id } },
              customer: { connect: { id: trip.customerId } },
              amount: trip.fare,
              amountPaid: 0,
              status: "Pending",
              method: "waafipay",
              provider: "waafipay",
              currency: process.env.WAAFI_CURRENCY || "SLSH",
              referenceId: buildWaafiReferenceId(trip.id),
              description: `Shipment ${trip.id} — ${trip.pickup} to ${trip.destination}`,
            },
          });
        }
      }
    }

    const typeMap = {
      Accepted: "driver.accepted",
      "Arrived Pickup": "driver.arrived",
      Delivered: "cargo.delivered",
    };

    const notification = await tx.notification.create({
      data: {
        userId: trip.customerId,
        type: typeMap[status] || "trip.status.updated",
        message: `${id} updated to ${status}`,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "trip.status.updated",
        entityType: "trips",
        entityId: id,
        meta: { status },
      },
    });

    const joined = await tx.trip.findUnique({
      where: { id },
      include: tripInclude,
    });

    return { trip: mapTrip(joined), notification: mapNotification(notification) };
  });
},

async updateTripLocation(id, { lat, lng }, { driverId } = {}) {
  const existing = await prisma.trip.findUnique({ where: { id } });
  if (!existing) return null;
  if (driverId && existing.driverId !== driverId) {
    const error = new Error("Not allowed to update this trip location");
    error.status = 403;
    throw error;
  }

  const trip = await prisma.trip.update({
    where: { id },
    data: {
      lastLat: lat,
      lastLng: lng,
      lastLocationAt: new Date(),
    },
  }).catch(() => null);

  if (!trip) return null;

  if (shouldRecordPoint(existing.lastLat, existing.lastLng, lat, lng)) {
    await prisma.tripLocationPoint.create({
      data: { tripId: id, lat, lng },
    });

    const extra = await prisma.tripLocationPoint.count({ where: { tripId: id } });
    if (extra > 500) {
      const stale = await prisma.tripLocationPoint.findMany({
        where: { tripId: id },
        orderBy: { recordedAt: "asc" },
        take: extra - 500,
        select: { id: true },
      });
      if (stale.length) {
        await prisma.tripLocationPoint.deleteMany({
          where: { id: { in: stale.map((row) => row.id) } },
        });
      }
    }
  }

  const eta = trip.destination ? estimateEta(lat, lng, trip.destination) : null;

  return {
    id,
    lastLocation: { lat, lng, updatedAt: new Date().toISOString() },
    eta,
  };
},

async listTripLocationHistory(tripId, { userId, role } = {}) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return null;

  if (role === "customer" && trip.customerId !== userId) {
    const error = new Error("Not allowed to view this trip route");
    error.status = 403;
    throw error;
  }
  if (role === "driver" && trip.driverId !== userId) {
    const error = new Error("Not allowed to view this trip route");
    error.status = 403;
    throw error;
  }

  const points = await prisma.tripLocationPoint.findMany({
    where: { tripId },
    orderBy: { recordedAt: "asc" },
    take: 300,
    select: { lat: true, lng: true, recordedAt: true },
  });

  return points.map((point) => ({
    lat: point.lat,
    lng: point.lng,
    at: point.recordedAt,
  }));
},

async uploadTripProof(id, { deliveryProofUrl, signatureUrl }, { driverId } = {}) {
  const existing = await prisma.trip.findUnique({ where: { id } });
  if (!existing) return null;
  if (driverId && existing.driverId !== driverId) {
    const error = new Error("Not allowed to upload proof for this trip");
    error.status = 403;
    throw error;
  }

  const data = {};
  if (deliveryProofUrl) data.deliveryProofUrl = deliveryProofUrl;
  if (signatureUrl) data.signatureUrl = signatureUrl;

  const trip = await prisma.trip.update({
    where: { id },
    data,
  }).catch(() => null);

  if (!trip) return null;
  await prisma.auditLog.create({
    data: auditFields({
      userId: driverId || existing.driverId,
      action: "trip.proof.uploaded",
      entityType: "trips",
      entityId: id,
      description: `Proof of delivery uploaded for trip ${id}`,
      oldValues: { deliveryProofUrl: existing.deliveryProofUrl, signatureUrl: existing.signatureUrl },
      newValues: { deliveryProofUrl: trip.deliveryProofUrl, signatureUrl: trip.signatureUrl },
    }),
  });
  return { id, deliveryProofUrl: trip.deliveryProofUrl, signatureUrl: trip.signatureUrl };
},

async submitTripFeedback(tripId, customerId, { rating, productRating, comment }) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return null;
  if (trip.customerId !== customerId) {
    const error = new Error("Not allowed to rate this trip");
    error.status = 403;
    throw error;
  }
  if (tripStatusToApi(trip.status) !== "Delivered") {
    const error = new Error("Feedback is only allowed after delivery");
    error.status = 400;
    throw error;
  }

  const existing = await prisma.tripFeedback.findUnique({ where: { tripId } });
  if (existing) {
    const error = new Error("Feedback already submitted for this trip");
    error.status = 409;
    throw error;
  }

  return withTransaction(async (tx) => {
    await tx.tripFeedback.create({
      data: {
        tripId,
        customerId,
        driverId: trip.driverId,
        rating,
        productRating: productRating ?? null,
        comment: comment?.trim() || null,
      },
    });

    if (trip.driverId) {
      await tx.notification.create({
        data: {
          userId: trip.driverId,
          type: "trip.feedback.received",
          message: `Customer rated trip ${tripId}: ${rating}/5 stars`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: customerId,
        action: "trip.feedback.submitted",
        entityType: "trips",
        entityId: tripId,
        meta: { rating, productRating },
      },
    });

    const joined = await tx.trip.findUnique({
      where: { id: tripId },
      include: tripInclude,
    });
    return mapTrip(joined);
  });
},

async confirmTripDelivery(tripId, customerId) {
  return withTransaction(async (tx) => {
    const trip = await tx.trip.findUnique({ where: { id: tripId } });
    if (!trip) return null;
    if (trip.customerId !== customerId) {
      const error = new Error("Not allowed to confirm this delivery");
      error.status = 403;
      throw error;
    }
    if (tripStatusToApi(trip.status) !== "Delivered") {
      const error = new Error("Only delivered trips can be confirmed");
      error.status = 400;
      throw error;
    }
    if (!trip.deliveryProofUrl) {
      const error = new Error("Proof of delivery must be uploaded before customer confirmation");
      error.status = 400;
      throw error;
    }
    const updated = await tx.trip.update({ where: { id: tripId }, data: { deliveryConfirmedAt: new Date() } });
    await tx.notification.create({
      data: {
        userId: customerId,
        type: "delivery.confirmed",
        message: `Delivery confirmed for ${tripId}. The remaining 70% balance is now due.`,
      },
    });
    await tx.auditLog.create({
      data: auditFields({ userId: customerId, action: "trip.delivery.confirmed", entityType: "trips", entityId: tripId, description: `Delivery confirmed for trip ${tripId}`, meta: {} }),
    });
    return mapTrip(updated);
  });
},

async listTripFeedback({ driverId, dispatcherId, customerId, complaintsOnly = false, page = 1, limit = 20 } = {}) {
  const where = {};
  if (driverId) where.driverId = driverId;
  if (customerId) where.customerId = customerId;
  if (dispatcherId) where.trip = { dispatcherId };
  if (complaintsOnly) where.reportProblem = true;

  const offset = (Number(page) - 1) * Number(limit);
  const [data, total, aggregates] = await Promise.all([
    prisma.tripFeedback.findMany({
      where,
      include: feedbackListInclude,
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: offset,
    }),
    prisma.tripFeedback.count({ where }),
    prisma.tripFeedback.aggregate({
      where,
      _avg: { rating: true, productRating: true, driverBehaviourRating: true, deliverySpeedRating: true, cargoConditionRating: true },
      _count: { _all: true },
    }),
  ]);

  return {
    data: data.map(mapFeedbackListItem),
    total,
    page: Number(page),
    summary: {
      count: aggregates._count._all,
      avgRating: aggregates._avg.rating ? Number(aggregates._avg.rating.toFixed(1)) : null,
      avgProductRating: aggregates._avg.productRating
        ? Number(aggregates._avg.productRating.toFixed(1))
        : null,
      avgDriverBehaviour: aggregates._avg.driverBehaviourRating ? Number(aggregates._avg.driverBehaviourRating.toFixed(1)) : null,
      avgDeliverySpeed: aggregates._avg.deliverySpeedRating ? Number(aggregates._avg.deliverySpeedRating.toFixed(1)) : null,
      avgCargoCondition: aggregates._avg.cargoConditionRating ? Number(aggregates._avg.cargoConditionRating.toFixed(1)) : null,
    },
  };
},

async rejectTrip(id, driverId) {
  return withTransaction(async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id, driverId },
    });
    if (!trip) return null;

    await tx.trip.update({
      where: { id },
      data: { status: "Cancelled" },
    });

    if (trip.cargoRequestId) {
      await tx.cargoRequest.update({
        where: { id: trip.cargoRequestId },
        data: { status: "Pending", driverId: null, truckId: null },
      });
    }

    if (trip.truckId) {
      await tx.truck.update({
        where: { id: trip.truckId },
        data: { status: "Available" },
      });
    }

    const notification = await tx.notification.create({
      data: {
        userId: trip.dispatcherId,
        type: "trip.rejected",
        message: `${id} rejected by driver`,
      },
    });

    return { id, status: "Cancelled", notification: mapNotification(notification) };
  });
},

async restoreTrip(id, actorId) {
  return withTransaction(async (tx) => {
    const existing = await tx.trip.findUnique({ where: { id } });
    if (!existing) return null;

    if (tripStatusToApi(existing.status) !== "Cancelled") {
      const error = new Error("Only cancelled trips can be restored");
      error.status = 400;
      throw error;
    }

    const truck = existing.truckId
      ? await tx.truck.findUnique({ where: { id: existing.truckId } })
      : null;

    if (truck && truck.status !== "Available") {
      const error = new Error("The truck of this trip is no longer available. Assign the request to another truck.");
      error.status = 400;
      throw error;
    }

    // The driver has to accept again, so a restored trip goes back to Assigned.
    const status = existing.driverId && truck ? "Assigned" : "Pending";

    await tx.trip.update({
      where: { id },
      data: { status: tripStatusToDb(status) },
    });

    if (existing.cargoRequestId) {
      await tx.cargoRequest.update({
        where: { id: existing.cargoRequestId },
        data: {
          status: reqStatusToDb(status === "Assigned" ? "Assigned" : "Approved"),
          driverId: status === "Assigned" ? existing.driverId : null,
          truckId: status === "Assigned" ? existing.truckId : null,
        },
      });
    }

    if (truck && status === "Assigned") {
      await tx.truck.update({
        where: { id: truck.id },
        data: { status: "Busy" },
      });
    }

    const notification = await tx.notification.create({
      data: {
        userId: existing.customerId,
        type: "trip.restored",
        message: `${id} restored to ${status}`,
      },
    });

    if (status === "Assigned" && existing.driverId) {
      await tx.notification.create({
        data: {
          userId: existing.driverId,
          type: "driver.assigned",
          message: `${id} restored and assigned to you again`,
        },
      });
    }

    await tx.auditLog.create({
      data: auditFields({
        userId: actorId,
        action: "trip.restored",
        entityType: "trips",
        entityId: id,
        description: `Trip ${id} restored`,
        oldValues: { status: "Cancelled" },
        newValues: { status },
      }),
    });

    const joined = await tx.trip.findUnique({
      where: { id },
      include: tripInclude,
    });

    return { trip: mapTrip(joined), notification: mapNotification(notification) };
  });
},

};
