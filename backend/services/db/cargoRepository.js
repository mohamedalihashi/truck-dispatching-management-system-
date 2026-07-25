import { prisma, withTransaction } from "../../lib/prisma.js";
import { auditFields } from "../../lib/auditContext.js";
import { buildWaafiReferenceId } from "../waafiPayService.js";
import { payloadDistance, estimateFare } from "./helpers.js";
import {
  estimateDistanceKm,
  calculateTransportPrice,
  parseWeightTons,
  estimateEtaLabel,
} from "../pricingService.js";
import { pricingRepository } from "./pricingRepository.js";
import {
  mapCargoRequest,
  mapNotification,
  cargoRequestInclude,
  reqStatusToDb,
  reqStatusToApi,
} from "./mappers.js";

export const cargoRepository = {
async getCargoRequestById(id) {
  const row = await prisma.cargoRequest.findUnique({
    where: { id },
    include: cargoRequestInclude,
  });
  return mapCargoRequest(row);
},

async listCargoRequests({ status, statuses, customerId, search, page = 1, limit = 20 } = {}) {
  const where = {};
  if (status) where.status = reqStatusToDb(status);
  if (statuses?.length) where.status = { in: statuses.map(reqStatusToDb) };
  if (customerId) where.customerId = customerId;
  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { pickup: { contains: search, mode: "insensitive" } },
      { destination: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
      { driver: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  const offset = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    prisma.cargoRequest.findMany({
      where,
      include: cargoRequestInclude,
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: offset,
    }),
    prisma.cargoRequest.count({ where }),
  ]);
  return { data: data.map(mapCargoRequest), total, page: Number(page) };
},

async cargoRequestSummary({ customerId, statuses } = {}) {
  const where = {};
  if (customerId) where.customerId = customerId;
  if (statuses?.length) where.status = { in: statuses.map(reqStatusToDb) };

  const activeStatuses = ["Approved", "Assigned", "Accepted", "Arrived_Pickup", "Loaded", "In_Transit"];

  const [total, pending, active, awaitingApproval, delivered, cancelled] = await Promise.all([
    prisma.cargoRequest.count({ where }),
    prisma.cargoRequest.count({ where: { ...where, status: "Pending" } }),
    prisma.cargoRequest.count({ where: { ...where, status: { in: activeStatuses } } }),
    prisma.cargoRequest.count({ where: { ...where, status: "Awaiting_Approval" } }),
    prisma.cargoRequest.count({ where: { ...where, status: "Delivered" } }),
    prisma.cargoRequest.count({ where: { ...where, status: "Cancelled" } }),
  ]);

  return { total, pending, active, awaitingApproval, delivered, cancelled };
},

async createCargoRequest(payload) {
  if (payload.submissionKey) {
    const existing = await prisma.cargoRequest.findFirst({
      where: { submissionKey: payload.submissionKey, customerId: payload.customerId },
      include: cargoRequestInclude,
    });
    if (existing) return { request: mapCargoRequest(existing), notification: null };
  }
  const id = `REQ-${Math.floor(9000 + Math.random() * 1000)}`;

  const settings = await pricingRepository.getPricingSettings();
  // Always suggest a calculated price on booking so customers and dispatchers see it immediately.
  const distanceKm = estimateDistanceKm(payload.pickup, payload.destination, {
    fromRegion: payload.fromRegion,
    fromDistrict: payload.fromDistrict,
    toRegion: payload.toRegion,
    toDistrict: payload.toDistrict,
  });
  const calc = calculateTransportPrice({
    distanceKm,
    weightTons: parseWeightTons(payload.weight),
    ...settings,
  });
  const estimatedTime = estimateEtaLabel(calc.distanceKm);
  const pricingFields = {
    distanceKm: calc.distanceKm,
    calculatedPrice: calc.calculatedPrice,
    finalPrice: calc.calculatedPrice,
    quotedEstimatedTime: estimatedTime,
  };

  return withTransaction(async (tx) => {
    const request = await tx.cargoRequest.create({
      data: {
        id,
        customerId: payload.customerId,
        dispatcherId: payload.dispatcherId || null,
        pickup: payload.pickup,
        destination: payload.destination,
        truckType: payload.truckType,
        weight: payload.weight,
        description: payload.description,
        receiver: payload.receiver || null,
        sender: payload.sender || null,
        customerRole: payload.customerRole || null,
        senderName: payload.senderName || null,
        senderPhone: payload.senderPhone || null,
        receiverName: payload.receiverName || null,
        receiverPhone: payload.receiverPhone || null,
        fromRegion: payload.fromRegion || null,
        fromDistrict: payload.fromDistrict || null,
        fromNeighborhood: payload.fromNeighborhood?.trim() || null,
        toRegion: payload.toRegion || null,
        toDistrict: payload.toDistrict || null,
        toNeighborhood: payload.toNeighborhood?.trim() || null,
        submissionKey: payload.submissionKey || null,
        specialInstructions: payload.specialInstructions || null,
        preferredPickupDate: payload.preferredPickupDate
          ? new Date(payload.preferredPickupDate)
          : null,
        status: "Pending",
        ...pricingFields,
      },
      include: cargoRequestInclude,
    });

    const [notification] = await Promise.all([
      tx.notification.create({
        data: {
          type: "order.created",
          message: `${id} created by ${payload.customerName || "Customer"}`,
        },
      }),
      tx.auditLog.create({
        data: {
          userId: payload.customerId,
          action: "cargo.created",
          entityType: "cargo_requests",
          entityId: id,
          meta: pricingFields.calculatedPrice != null
            ? {
                calculatedPrice: Number(pricingFields.calculatedPrice),
                distanceKm: Number(pricingFields.distanceKm),
              }
            : {},
        },
      }),
    ]);

    return { request: mapCargoRequest(request), notification: mapNotification(notification) };
  });
},

async updateCargoRequest(id, payload, { customerId } = {}) {
  const existing = await prisma.cargoRequest.findUnique({ where: { id } });
  if (!existing) return null;

  if (customerId && existing.customerId !== customerId) {
    const error = new Error("Not allowed to update this request");
    error.status = 403;
    throw error;
  }
  if (reqStatusToApi(existing.status) !== "Pending") {
    const error = new Error("Only pending requests can be edited");
    error.status = 400;
    throw error;
  }

  const data = {};
  if (payload.pickup !== undefined) data.pickup = payload.pickup;
  if (payload.destination !== undefined) data.destination = payload.destination;
  if (payload.truckType !== undefined) data.truckType = payload.truckType;
  if (payload.weight !== undefined) data.weight = payload.weight;
  if (payload.description !== undefined) data.description = payload.description;
  if (payload.receiver !== undefined) data.receiver = payload.receiver;
  if (payload.sender !== undefined) data.sender = payload.sender;
  if (payload.customerRole !== undefined) data.customerRole = payload.customerRole;
  if (payload.senderName !== undefined) data.senderName = payload.senderName;
  if (payload.senderPhone !== undefined) data.senderPhone = payload.senderPhone;
  if (payload.receiverName !== undefined) data.receiverName = payload.receiverName;
  if (payload.receiverPhone !== undefined) data.receiverPhone = payload.receiverPhone;
  if (payload.fromRegion !== undefined) data.fromRegion = payload.fromRegion;
  if (payload.fromDistrict !== undefined) data.fromDistrict = payload.fromDistrict;
  if (payload.fromNeighborhood !== undefined) data.fromNeighborhood = payload.fromNeighborhood.trim();
  if (payload.toRegion !== undefined) data.toRegion = payload.toRegion;
  if (payload.toDistrict !== undefined) data.toDistrict = payload.toDistrict;
  if (payload.toNeighborhood !== undefined) data.toNeighborhood = payload.toNeighborhood.trim();
  if (payload.specialInstructions !== undefined) data.specialInstructions = payload.specialInstructions;
  if (payload.preferredPickupDate !== undefined) {
    data.preferredPickupDate = payload.preferredPickupDate
      ? new Date(payload.preferredPickupDate)
      : null;
  }

  const routeChanged = [
    "pickup",
    "destination",
    "weight",
    "fromRegion",
    "fromDistrict",
    "toRegion",
    "toDistrict",
  ].some((key) => data[key] !== undefined);

  if (routeChanged) {
    const settings = await pricingRepository.getPricingSettings();
    const pickup = data.pickup ?? existing.pickup;
    const destination = data.destination ?? existing.destination;
    const distanceKm = estimateDistanceKm(pickup, destination, {
      fromRegion: data.fromRegion ?? existing.fromRegion,
      fromDistrict: data.fromDistrict ?? existing.fromDistrict,
      toRegion: data.toRegion ?? existing.toRegion,
      toDistrict: data.toDistrict ?? existing.toDistrict,
    });
    const calc = calculateTransportPrice({
      distanceKm,
      weightTons: parseWeightTons(data.weight ?? existing.weight),
      ...settings,
    });
    data.distanceKm = calc.distanceKm;
    data.calculatedPrice = calc.calculatedPrice;
    data.finalPrice = calc.calculatedPrice;
    data.quotedEstimatedTime = estimateEtaLabel(calc.distanceKm);
    data.adjustmentType = null;
    data.adjustmentAmount = null;
    data.adjustmentReason = null;
  }

  if (Object.keys(data).length > 0) {
    await prisma.cargoRequest.update({ where: { id }, data });
  }

  const updated = await prisma.cargoRequest.findUnique({
    where: { id },
    include: cargoRequestInclude,
  });
  await prisma.auditLog.create({
    data: auditFields({
      userId: customerId || existing.customerId,
      action: "cargo.updated",
      entityType: "cargo_requests",
      entityId: id,
      description: `Cargo request ${id} updated`,
      oldValues: existing,
      newValues: data,
    }),
  });
  return mapCargoRequest(updated);
},

async submitCargoQuote() {
  const error = new Error(
    "Manual quotations are disabled. The system sets price and ETA from distance (km). Assign a driver instead."
  );
  error.status = 410;
  throw error;
},

async acceptCargoQuote() {
  const error = new Error(
    "Quote acceptance is disabled. Pay the deposit after a driver is assigned."
  );
  error.status = 410;
  throw error;
},

async rejectCargoQuote() {
  const error = new Error("Quote rejection is disabled. Quotations are no longer used.");
  error.status = 410;
  throw error;
},

async assignCargoRequest(id, { driverId, truckId, dispatcherId }) {
  return withTransaction(async (tx) => {
    const truckCheck = await tx.truck.findFirst({
      where: { id: truckId, driverId },
    });
    if (!truckCheck) {
      const error = new Error("Truck must belong to the selected driver");
      error.status = 400;
      throw error;
    }

    const current = await tx.cargoRequest.findUnique({ where: { id } });
    if (!current) return null;

    const normalizeType = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (normalizeType(truckCheck.truckType) !== normalizeType(current.truckType)) {
      const error = new Error(
        `Truck type does not match. Request needs "${current.truckType}", selected truck is "${truckCheck.truckType}".`
      );
      error.status = 400;
      throw error;
    }

    const currentStatus = reqStatusToApi(current.status);
    const assignable = ["Pending", "Awaiting Approval", "Quote Rejected", "Approved", "Assigned"];
    if (!assignable.includes(currentStatus)) {
      const error = new Error(
        `Cannot assign a driver while the request is "${currentStatus}"`
      );
      error.status = 400;
      throw error;
    }

    const suggestedPrice =
      current.finalPrice != null
        ? Number(current.finalPrice)
        : current.calculatedPrice != null
          ? Number(current.calculatedPrice)
          : current.quotedPrice != null
            ? Number(current.quotedPrice)
            : null;

    if (suggestedPrice == null || !Number.isFinite(suggestedPrice) || suggestedPrice <= 0) {
      const error = new Error("Request has no calculated price yet. Recalculate pricing before assigning.");
      error.status = 400;
      throw error;
    }

    const distanceKm =
      current.distanceKm != null
        ? Number(current.distanceKm)
        : estimateDistanceKm(current.pickup, current.destination);
    const tripEta = estimateEtaLabel(distanceKm);

    const quoteFields = {
      quotedPrice: suggestedPrice,
      quotedEstimatedTime: tripEta,
      finalPrice: suggestedPrice,
    };

    const tripFare = suggestedPrice;

    // Release previous truck if reassigning
    if (current.truckId && current.truckId !== truckId) {
      await tx.truck.update({
        where: { id: current.truckId },
        data: { status: "Available" },
      });
    }

    const updated = await tx.cargoRequest.update({
      where: { id },
      data: {
        status: "Assigned",
        driverId,
        truckId,
        dispatcherId,
        ...quoteFields,
      },
    });

    // Find or create trip — real GPS comes only from the driver's phone.
    const existingTrip = await tx.trip.findFirst({
      where: {
        cargoRequestId: id,
        status: { notIn: ["Delivered", "Cancelled"] },
      },
      orderBy: { createdAt: "desc" },
    });

    let tripId;
    if (existingTrip) {
      tripId = existingTrip.id;
      await tx.trip.update({
        where: { id: tripId },
        data: {
          driverId,
          truckId,
          dispatcherId,
          status: "Assigned",
          fare: tripFare,
          estimatedTime: tripEta,
        },
      });
    } else {
      tripId = `SHP-${Math.floor(10000 + Math.random() * 9000)}`;
      await tx.trip.create({
        data: {
          id: tripId,
          cargoRequestId: updated.id,
          customerId: updated.customerId,
          driverId,
          dispatcherId,
          truckId,
          pickup: updated.pickup,
          destination: updated.destination,
          distance: payloadDistance(updated.pickup, updated.destination),
          estimatedTime: tripEta,
          status: "Assigned",
          fare: tripFare,
        },
      });
    }

    await tx.truck.update({
      where: { id: truckId },
      data: { status: "Busy" },
    });

    const payment = await tx.payment.findFirst({ where: { tripId } });
    if (!payment) {
      await tx.payment.create({
        data: {
          tripId,
          customerId: updated.customerId,
          amount: tripFare,
          amountPaid: 0,
          status: "Pending",
          method: "waafipay",
          provider: "waafipay",
          currency: process.env.WAAFI_CURRENCY || "SLSH",
          referenceId: buildWaafiReferenceId(tripId),
          description: `Shipment ${tripId} — 30% deposit required before trip can start`,
        },
      });
    }

    const notification = await tx.notification.create({
      data: {
        userId: driverId,
        type: "driver.assigned",
        message: `${id} assigned to driver`,
      },
    });

    await tx.notification.create({
      data: {
        userId: updated.customerId,
        type: "driver.assigned",
        message: `${id} assigned. Trip ${tripId} created — pay 30% deposit before the trip starts.`,
      },
    });

    await tx.auditLog.create({
      data: auditFields({
        userId: dispatcherId,
        action: "trip.assigned",
        entityType: "trips",
        entityId: tripId,
        description: `Driver and truck assigned to cargo request ${id}`,
        oldValues: { driverId: current.driverId, truckId: current.truckId },
        newValues: { driverId, truckId, cargoRequestId: id },
      }),
    });

    const request = await tx.cargoRequest.findUnique({
      where: { id },
      include: cargoRequestInclude,
    });

    return { request: mapCargoRequest(request), tripId, notification: mapNotification(notification) };
  });
},

async cancelCargoRequest(id, actorId, { customerId } = {}) {
  return withTransaction(async (tx) => {
    const existing = await tx.cargoRequest.findUnique({ where: { id } });
    if (!existing) return null;

    if (customerId && existing.customerId !== customerId) {
      const error = new Error("Not allowed to cancel this request");
      error.status = 403;
      throw error;
    }

    const apiStatus = reqStatusToApi(existing.status);
    const nonCancelable = ["Loaded", "In Transit", "Delivered", "Cancelled"];
    if (nonCancelable.includes(apiStatus)) {
      const error = new Error("Cannot cancel a request in this status");
      error.status = 400;
      throw error;
    }

    if (existing.truckId) {
      await tx.truck.update({
        where: { id: existing.truckId },
        data: { status: "Available" },
      });
    }

    await tx.trip.updateMany({
      where: {
        cargoRequestId: id,
        status: { notIn: ["Delivered", "Cancelled"] },
      },
      data: { status: "Cancelled" },
    });

    await tx.cargoRequest.update({
      where: { id },
      data: {
        status: "Cancelled",
        driverId: null,
        truckId: null,
      },
    });

    await tx.notification.create({
      data: {
        userId: existing.customerId,
        type: "order.cancelled",
        message: `${id} cancelled`,
      },
    });

    if (actorId && actorId !== existing.customerId) {
      await tx.notification.create({
        data: {
          userId: actorId,
          type: "order.cancelled",
          message: `${id} cancelled by dispatcher`,
        },
      });
    }

    await tx.auditLog.create({
      data: auditFields({
        userId: actorId || existing.customerId,
        action: "cargo.cancelled",
        entityType: "cargo_requests",
        entityId: id,
        description: `Cargo request ${id} cancelled`,
        oldValues: { status: apiStatus },
        newValues: { status: "Cancelled" },
      }),
    });

    const request = await tx.cargoRequest.findUnique({
      where: { id },
      include: cargoRequestInclude,
    });
    return mapCargoRequest(request);
  });
},

async restoreCargoRequest(id, actorId, { customerId } = {}) {
  return withTransaction(async (tx) => {
    const existing = await tx.cargoRequest.findUnique({ where: { id } });
    if (!existing) return null;

    if (customerId && existing.customerId !== customerId) {
      const error = new Error("Not allowed to restore this request");
      error.status = 403;
      throw error;
    }

    if (reqStatusToApi(existing.status) !== "Cancelled") {
      const error = new Error("Only cancelled requests can be restored");
      error.status = 400;
      throw error;
    }

    const lastCancel = await tx.auditLog.findFirst({
      where: { action: "cargo.cancelled", entityId: id },
      orderBy: { createdAt: "desc" },
    });

    // Driver and truck are released on cancel, so anything that implied an
    // assignment comes back one step earlier and has to be assigned again.
    const restorable = ["Pending", "Awaiting Approval", "Quote Rejected", "Approved"];
    const previous = lastCancel?.oldValues?.status;
    const status = restorable.includes(previous) ? previous : previous ? "Approved" : "Pending";

    await tx.cargoRequest.update({
      where: { id },
      data: { status: reqStatusToDb(status) },
    });

    const notification = await tx.notification.create({
      data: {
        userId: existing.customerId,
        type: "order.restored",
        message: `${id} restored to ${status}`,
      },
    });

    await tx.auditLog.create({
      data: auditFields({
        userId: actorId || existing.customerId,
        action: "cargo.restored",
        entityType: "cargo_requests",
        entityId: id,
        description: `Cargo request ${id} restored`,
        oldValues: { status: "Cancelled" },
        newValues: { status },
      }),
    });

    const request = await tx.cargoRequest.findUnique({
      where: { id },
      include: cargoRequestInclude,
    });
    return { request: mapCargoRequest(request), notification: mapNotification(notification) };
  });
},

};
