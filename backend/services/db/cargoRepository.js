import { prisma, withTransaction } from "../../lib/prisma.js";
import { auditFields } from "../../lib/auditContext.js";
import { coordsFromPlaceName } from "../../lib/somaliaGeo.js";
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
  const distanceKm = estimateDistanceKm(payload.pickup, payload.destination);
  const calc = calculateTransportPrice({
    distanceKm,
    weightTons: parseWeightTons(payload.weight),
    ...settings,
  });
  const pricingFields = {
    distanceKm: calc.distanceKm,
    calculatedPrice: calc.calculatedPrice,
    finalPrice: calc.calculatedPrice,
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

async submitCargoQuote(id, { quotedPrice, quotedEstimatedTime, quoteNotes, driverId, dispatcherId }) {
  return withTransaction(async (tx) => {
    const existing = await tx.cargoRequest.findUnique({ where: { id } });
    if (!existing) return null;

    const apiStatus = reqStatusToApi(existing.status);
    if (!["Pending", "Quote Rejected"].includes(apiStatus)) {
      const error = new Error("Only pending or quote-rejected requests can receive a quotation");
      error.status = 400;
      throw error;
    }
    if (!quotedEstimatedTime?.trim()) {
      const error = new Error("quotedEstimatedTime is required");
      error.status = 400;
      throw error;
    }

    const price =
      quotedPrice != null
        ? Number(quotedPrice)
        : existing.finalPrice != null
          ? Number(existing.finalPrice)
          : existing.calculatedPrice != null
            ? Number(existing.calculatedPrice)
            : null;
    if (price == null || !Number.isFinite(price) || price <= 0) {
      const error = new Error("A calculated or adjusted final price is required before sending the quote");
      error.status = 400;
      throw error;
    }

    if (!driverId) {
      const error = new Error("Select an available driver/truck before sending the quote");
      error.status = 400;
      throw error;
    }

    const truck = await tx.truck.findUnique({ where: { driverId } });
    if (!truck || truck.status !== "Available") {
      const error = new Error("An available truck is required to submit a quote");
      error.status = 400;
      throw error;
    }
    const normalizeType = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (normalizeType(truck.truckType) !== normalizeType(existing.truckType)) {
      const error = new Error("Your truck type does not match this cargo request");
      error.status = 400;
      throw error;
    }

    await tx.cargoRequest.update({
      where: { id },
      data: {
        status: "Awaiting_Approval",
        quotedPrice: price,
        finalPrice: price,
        calculatedPrice: existing.calculatedPrice ?? price,
        quotedEstimatedTime: quotedEstimatedTime.trim(),
        quoteNotes: quoteNotes?.trim() || null,
        quotedAt: new Date(),
        quoteVersion: (existing.quoteVersion || 0) + 1,
        driverId,
        truckId: truck.id,
        dispatcherId: dispatcherId || existing.dispatcherId,
        approvedByDispatcher: dispatcherId || existing.approvedByDispatcher || driverId,
        approvedAt: existing.approvedAt || new Date(),
        customerDecisionAt: null,
        customerDecisionNote: null,
      },
    });

    const notification = await tx.notification.create({
      data: {
        userId: existing.customerId,
        type: "quote.sent",
        message: `Quotation ready for ${id}: $${Number(price).toFixed(2)} — ${quotedEstimatedTime.trim()}`,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: dispatcherId || driverId,
        action: "cargo.quote.sent",
        entityType: "cargo_requests",
        entityId: id,
        meta: {
          quotedPrice: Number(price),
          calculatedPrice: existing.calculatedPrice != null ? Number(existing.calculatedPrice) : null,
          adjustmentType: existing.adjustmentType,
          quotedEstimatedTime,
        },
      },
    });

    const request = await tx.cargoRequest.findUnique({
      where: { id },
      include: cargoRequestInclude,
    });

    return { request: mapCargoRequest(request), notification: mapNotification(notification) };
  });
},

async acceptCargoQuote(id, { customerId }) {
  return withTransaction(async (tx) => {
    const existing = await tx.cargoRequest.findUnique({ where: { id } });
    if (!existing) return null;

    if (existing.customerId !== customerId) {
      const error = new Error("Not allowed to approve this quotation");
      error.status = 403;
      throw error;
    }
    if (reqStatusToApi(existing.status) !== "Awaiting Approval") {
      const error = new Error("This request is not waiting for customer approval");
      error.status = 400;
      throw error;
    }
    if (!existing.driverId || !existing.truckId || !(existing.quotedPrice ?? existing.finalPrice)) {
      const error = new Error("The quotation must include a driver, truck, and price");
      error.status = 400;
      throw error;
    }

    const fare = Number(existing.finalPrice ?? existing.quotedPrice);

    await tx.cargoRequest.update({
      where: { id },
      data: {
        status: "Approved",
        customerDecisionAt: new Date(),
        customerDecisionNote: null,
        quotedPrice: fare,
        finalPrice: fare,
      },
    });

    const existingTrip = await tx.trip.findFirst({
      where: { cargoRequestId: id, status: { notIn: ["Delivered", "Cancelled"] } },
      orderBy: { createdAt: "desc" },
    });
    const tripId = existingTrip?.id || `SHP-${Math.floor(10000 + Math.random() * 90000)}`;
    const pickupCoords = coordsFromPlaceName(existing.pickup);
    if (existingTrip) {
      await tx.trip.update({
        where: { id: tripId },
        data: {
          driverId: existing.driverId,
          dispatcherId: existing.dispatcherId,
          truckId: existing.truckId,
          status: "Pending",
          fare,
          estimatedTime: existing.quotedEstimatedTime,
          distance: existing.distanceKm != null ? `${existing.distanceKm} km` : payloadDistance(existing.pickup, existing.destination),
        },
      });
    } else {
      await tx.trip.create({
        data: {
          id: tripId,
          cargoRequestId: id,
          customerId,
          driverId: existing.driverId,
          dispatcherId: existing.dispatcherId,
          truckId: existing.truckId,
          pickup: existing.pickup,
          destination: existing.destination,
          distance: existing.distanceKm != null ? `${existing.distanceKm} km` : payloadDistance(existing.pickup, existing.destination),
          estimatedTime: existing.quotedEstimatedTime,
          status: "Pending",
          fare,
          lastLat: pickupCoords.lat,
          lastLng: pickupCoords.lng,
          lastLocationAt: new Date(),
        },
      });
      await tx.tripLocationPoint.create({
        data: { tripId, lat: pickupCoords.lat, lng: pickupCoords.lng },
      });
    }

    const payment = await tx.payment.findFirst({ where: { tripId } });
    if (!payment) {
      await tx.payment.create({
        data: {
          tripId,
          customerId,
          amount: fare,
          amountPaid: 0,
          status: "Pending",
          method: "waafipay",
          provider: "waafipay",
          currency: process.env.WAAFI_CURRENCY || "SLSH",
          referenceId: buildWaafiReferenceId(tripId),
          description: `Shipment ${tripId} — 30% deposit required to confirm`,
        },
      });
    }
    await tx.truck.update({ where: { id: existing.truckId }, data: { status: "Busy" } });

    if (existing.driverId) {
      await tx.notification.create({
        data: {
          userId: existing.driverId,
          type: "quote.accepted",
          message: `Customer approved quotation for ${id}`,
        },
      });
    }

    await tx.notification.create({
      data: {
        userId: customerId,
        type: "quote.accepted",
        message: `Quotation approved for ${id}. Pay the 30% deposit to confirm trip ${tripId}.`,
      },
    });

    await tx.auditLog.create({
      data: auditFields({
        userId: customerId,
        action: "cargo.quote.accepted",
        entityType: "cargo_requests",
        entityId: id,
        description: `Customer accepted quote and deposit invoice was created for trip ${tripId}`,
        newValues: { tripId, total: Number(existing.quotedPrice), depositPercent: 30 },
      }),
    });

    const request = await tx.cargoRequest.findUnique({
      where: { id },
      include: cargoRequestInclude,
    });
    return mapCargoRequest(request);
  });
},

async rejectCargoQuote(id, { customerId, note }) {
  return withTransaction(async (tx) => {
    const existing = await tx.cargoRequest.findUnique({ where: { id } });
    if (!existing) return null;

    if (existing.customerId !== customerId) {
      const error = new Error("Not allowed to reject this quotation");
      error.status = 403;
      throw error;
    }
    if (reqStatusToApi(existing.status) !== "Awaiting Approval") {
      const error = new Error("This request is not waiting for customer approval");
      error.status = 400;
      throw error;
    }

    await tx.cargoRequest.update({
      where: { id },
      data: {
        status: "Quote_Rejected",
        customerDecisionAt: new Date(),
        customerDecisionNote: note?.trim() || null,
      },
    });

    if (existing.driverId) {
      await tx.notification.create({
        data: {
          userId: existing.driverId,
          type: "quote.rejected",
          message: `Customer rejected quotation for ${id}${note ? `: ${note.trim()}` : ""}`,
        },
      });
    }

    const request = await tx.cargoRequest.findUnique({
      where: { id },
      include: cargoRequestInclude,
    });
    return mapCargoRequest(request);
  });
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
    const assignable = ["Pending", "Quote Rejected", "Approved", "Assigned"];
    if (!assignable.includes(currentStatus)) {
      const error = new Error(
        `Cannot assign a driver while the request is "${currentStatus}"`
      );
      error.status = 400;
      throw error;
    }

    const suggestedPrice =
      current.quotedPrice != null
        ? Number(current.quotedPrice)
        : current.finalPrice != null
          ? Number(current.finalPrice)
          : current.calculatedPrice != null
            ? Number(current.calculatedPrice)
            : null;

    if (suggestedPrice == null || !Number.isFinite(suggestedPrice) || suggestedPrice <= 0) {
      const error = new Error("Request has no calculated price yet. Recalculate or send a quote first.");
      error.status = 400;
      throw error;
    }

    const distanceKm =
      current.distanceKm != null
        ? Number(current.distanceKm)
        : estimateDistanceKm(current.pickup, current.destination);
    const tripEta = current.quotedEstimatedTime || estimateEtaLabel(distanceKm);

    const quoteFields =
      current.quotedPrice == null || !current.quotedEstimatedTime
        ? {
            quotedPrice: suggestedPrice,
            quotedEstimatedTime: tripEta,
            finalPrice: current.finalPrice != null ? Number(current.finalPrice) : suggestedPrice,
          }
        : {};

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
        message: `${id} assigned. Trip ${tripId} created`,
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
