import { prisma, withTransaction } from "../../lib/prisma.js";
import { auditFields } from "../../lib/auditContext.js";
import { buildWaafiReferenceId } from "../waafiPayService.js";
import { estimateFare } from "../pricingRates.js";
import { estimateDistanceKm } from "../pricingService.js";
import {
  mapCargoRequest,
  mapNotification,
  cargoRequestInclude,
  reqStatusToDb,
  reqStatusToApi,
} from "./mappers.js";
import {
  TRIP_NOTIFY,
  formatCustomerNotifyLine,
  formatNotifyLines,
} from "../../lib/tripCustomerMessages.js";

export const cargoRepository = {
async getCargoRequestById(id) {
  const row = await prisma.cargoRequest.findUnique({
    where: { id },
    include: cargoRequestInclude,
  });
  return mapCargoRequest(row);
},

async listCargoRequests({ status, statuses, customerId, driverId, loadType, search, page = 1, limit = 20 } = {}) {
  const and = [];
  if (status) and.push({ status: reqStatusToDb(status) });
  if (statuses?.length) and.push({ status: { in: statuses.map(reqStatusToDb) } });
  if (customerId) and.push({ customerId });
  if (driverId) and.push({ driverId });
  if (loadType) and.push({ loadType });
  if (search) {
    and.push({
      OR: [
        { id: { contains: search, mode: "insensitive" } },
        { pickup: { contains: search, mode: "insensitive" } },
        { destination: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { driver: { name: { contains: search, mode: "insensitive" } } },
      ],
    });
  }
  const where = and.length ? { AND: and } : {};
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

  const activeStatuses = [
    "Approved",
    "Assigned",
    "En_Route_to_Pickup",
    "Arrived_at_Pickup",
    "Picked_Up",
    "In_Transit",
    "Near_Destination",
  ];

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

  let truckId = payload.truckId || null;
  let driverId = payload.driverId || null;
  let loadType = payload.loadType || "FTL";
  let truckType = payload.truckType || "Any";
  const cargoType = payload.cargoType?.trim() || null;
  const description =
    payload.description?.trim() ||
    (cargoType
      ? `${cargoType} — ${payload.weight || "cargo"}`
      : `Cargo weighing ${payload.weight || ""}`.trim());

  if (payload.preferredTruckId) {
    const truck = await prisma.truck.findUnique({
      where: { id: payload.preferredTruckId },
      select: {
        id: true,
        truckNumber: true,
        truckType: true,
        status: true,
        driver: {
          select: {
            role: true,
            serviceType: true,
            status: true,
          },
        },
      },
    });
    if (!truck || !truck.driver || truck.driver.role !== "driver") {
      const error = new Error("Selected truck is not available");
      error.status = 400;
      throw error;
    }
    if (truck.driver.serviceType === "SHARED") {
      const error = new Error("This truck only offers shared load capacity. Use Shared booking in the Management system.");
      error.status = 400;
      throw error;
    }
    if (truck.status !== "Available" || truck.driver.status !== "Active") {
      const error = new Error("Selected truck is not available to book right now");
      error.status = 400;
      throw error;
    }
    // Customer preference only — admin assigns the driver; no direct link at booking time.
    loadType = "FTL";
    truckType = truck.truckType;
    if (!payload.specialInstructions?.includes(truck.truckNumber)) {
      payload.specialInstructions = [
        payload.specialInstructions,
        `Preferred truck: ${truck.truckNumber}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }

  const route = {
    pickup: payload.pickup,
    destination: payload.destination,
    fromRegion: payload.fromRegion,
    fromDistrict: payload.fromDistrict,
    toRegion: payload.toRegion,
    toDistrict: payload.toDistrict,
  };
  let distanceKm =
    payload.distanceKm != null && Number.isFinite(Number(payload.distanceKm))
      ? Number(payload.distanceKm)
      : null;
  if (distanceKm == null && payload.pickup && payload.destination) {
    const estimated = estimateDistanceKm(payload.pickup, payload.destination, route);
    if (Number.isFinite(estimated) && estimated > 0) distanceKm = estimated;
  }
  const quotedEstimatedTime = payload.quotedEstimatedTime?.trim() || null;
  let calculatedPrice =
    payload.calculatedPrice != null && Number(payload.calculatedPrice) > 0
      ? Number(payload.calculatedPrice)
      : null;
  const weightIsKnown = (() => {
    const raw = String(payload.weight || "").trim().toLowerCase();
    if (!raw || raw === "tbd" || raw === "pending" || raw === "n/a") return false;
    return Number.parseFloat(raw.replace(/,/g, "")) > 0;
  })();
  if (calculatedPrice == null && weightIsKnown) {
    calculatedPrice = await estimateFare(payload.weight, loadType, {
      ...route,
      distanceKm,
    });
  }

  return withTransaction(async (tx) => {
    const customer = await tx.user.findUnique({
      where: { id: payload.customerId },
      select: { name: true },
    });
    const customerName =
      payload.customerName ||
      payload.senderName ||
      payload.receiverName ||
      customer?.name ||
      null;

    const request = await tx.cargoRequest.create({
      data: {
        id,
        customerId: payload.customerId,
        dispatcherId: payload.dispatcherId || null,
        driverId,
        truckId,
        loadType,
        pickup: payload.pickup,
        destination: payload.destination,
        truckType,
        cargoType,
        weight: payload.weight,
        description,
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
        calculatedPrice,
        distanceKm,
        quotedEstimatedTime,
      },
      include: cargoRequestInclude,
    });

    const [notification] = await Promise.all([
      tx.notification.create({
        data: {
          userId: payload.customerId,
          type: "booking.created",
          message: formatCustomerNotifyLine(TRIP_NOTIFY.bookingCreated, {
            bookingId: id,
            status: "Pending",
            customerName,
            pickup: request.pickup,
            destination: request.destination,
            fromRegion: request.fromRegion,
            fromDistrict: request.fromDistrict,
            toRegion: request.toRegion,
            toDistrict: request.toDistrict,
          }),
        },
      }),
      tx.auditLog.create({
        data: {
          userId: payload.customerId,
          action: "cargo.created",
          entityType: "cargo_requests",
          entityId: id,
          meta: {},
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
  if (payload.cargoType !== undefined) data.cargoType = payload.cargoType;
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

    if (driverId && existing.driverId && existing.driverId !== driverId) {
      const error = new Error("This booking is assigned to another driver");
      error.status = 403;
      throw error;
    }

    const currentStatus = reqStatusToApi(existing.status);
    if (!["Pending", "Quote Rejected"].includes(currentStatus)) {
      const error = new Error(`Cannot submit a quote while status is "${currentStatus}"`);
      error.status = 400;
      throw error;
    }

    let driver = null;
    if (driverId) {
      driver = await tx.user.findUnique({
        where: { id: driverId },
        select: {
          id: true,
          name: true,
          role: true,
          truck: { select: { id: true } },
        },
      });
      if (!driver || driver.role !== "driver") {
        const error = new Error("Driver account required");
        error.status = 403;
        throw error;
      }
    }

    const price = quotedPrice != null
      ? Number(quotedPrice)
      : existing.finalPrice != null
        ? Number(existing.finalPrice)
        : existing.calculatedPrice != null
          ? Number(existing.calculatedPrice)
          : null;

    if (price == null || !Number.isFinite(price) || price <= 0) {
      const error = new Error("Quoted price is required");
      error.status = 400;
      throw error;
    }

    const updated = await tx.cargoRequest.update({
      where: { id },
      data: {
        status: "Awaiting_Approval",
        quotedPrice: price,
        finalPrice: price,
        quotedEstimatedTime,
        quoteNotes: quoteNotes || null,
        quotedAt: new Date(),
        quoteVersion: { increment: 1 },
        driverId: driverId || existing.driverId,
        truckId: driver?.truck?.id || existing.truckId,
        approvedByDispatcher: dispatcherId || null,
        approvedAt: dispatcherId ? new Date() : null,
      },
      include: cargoRequestInclude,
    });

    const notification = await tx.notification.create({
      data: {
        userId: updated.customerId,
        type: "quote.sent",
        message: formatNotifyLines(`Qiimo: $${price.toLocaleString()}`, {
          bookingId: id,
          status: "Awaiting Approval",
          customerName:
            updated.customer?.name ||
            updated.senderName ||
            updated.receiverName ||
            null,
          driverName: driver?.name || updated.driver?.name || null,
          pickup: updated.pickup,
          destination: updated.destination,
          fromRegion: updated.fromRegion,
          fromDistrict: updated.fromDistrict,
          toRegion: updated.toRegion,
          toDistrict: updated.toDistrict,
          body: "Fadlan aqbal ama diid qiimaha darawalka soo diray.",
        }),
      },
    });

    return { request: mapCargoRequest(updated), notification: mapNotification(notification) };
  });
},

async acceptCargoQuote(id, { customerId, allowAdmin = false } = {}) {
  return withTransaction(async (tx) => {
    const existing = await tx.cargoRequest.findUnique({ where: { id } });
    if (!existing) return null;
    if (!allowAdmin && existing.customerId !== customerId) {
      const error = new Error("Not allowed to accept this quote");
      error.status = 403;
      throw error;
    }
    if (reqStatusToApi(existing.status) !== "Awaiting Approval") {
      const error = new Error("No quote awaiting approval");
      error.status = 400;
      throw error;
    }
    if (!existing.driverId) {
      const error = new Error("Driver must be assigned before accepting");
      error.status = 400;
      throw error;
    }

    const fare = existing.quotedPrice != null ? Number(existing.quotedPrice) : Number(existing.finalPrice || 0);
    const updated = await tx.cargoRequest.update({
      where: { id },
      data: {
        status: "Assigned",
        finalPrice: fare,
        customerDecisionAt: new Date(),
      },
      include: cargoRequestInclude,
    });

    const tripId = `SHP-${Math.floor(10000 + Math.random() * 9000)}`;
    await tx.trip.create({
      data: {
        id: tripId,
        cargoRequestId: id,
        customerId: existing.customerId,
        driverId: existing.driverId,
        truckId: existing.truckId,
        pickup: existing.pickup,
        destination: existing.destination,
        distance: existing.distanceKm != null ? `${existing.distanceKm} km` : null,
        estimatedTime: existing.quotedEstimatedTime,
        status: "Assigned",
        fare,
      },
    });

    if (existing.truckId) {
      await tx.truck.update({ where: { id: existing.truckId }, data: { status: "Busy" } });
    }

    await tx.payment.create({
      data: {
        tripId,
        customerId: existing.customerId,
        amount: fare,
        amountPaid: 0,
        status: "Pending",
        method: "waafipay",
        provider: "waafipay",
        currency: process.env.WAAFI_CURRENCY || "SLSH",
        referenceId: buildWaafiReferenceId(tripId),
        description: `Shipment ${tripId} — pay 100% after delivery`,
      },
    });

    await tx.notification.create({
      data: {
        userId: existing.driverId,
        type: "quote.accepted",
        message: formatNotifyLines("Macmiilku wuu aqbalay qiimaha", {
          bookingId: id,
          tripId,
          status: "Assigned",
          pickup: existing.pickup,
          destination: existing.destination,
          fromRegion: existing.fromRegion,
          fromDistrict: existing.fromDistrict,
          toRegion: existing.toRegion,
          toDistrict: existing.toDistrict,
          body: "Safar ayaa la abuuray — lacagta 100% waxaa la bixiyaa Delivered ka dib.",
        }),
      },
    });

    return mapCargoRequest(updated);
  });
},

async rejectCargoQuote(id, { customerId, note }) {
  const existing = await prisma.cargoRequest.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.customerId !== customerId) {
    const error = new Error("Not allowed to reject this quote");
    error.status = 403;
    throw error;
  }
  if (reqStatusToApi(existing.status) !== "Awaiting Approval") {
    const error = new Error("No quote awaiting approval");
    error.status = 400;
    throw error;
  }

  const updated = await prisma.cargoRequest.update({
    where: { id },
    data: {
      status: "Quote_Rejected",
      customerDecisionAt: new Date(),
      customerDecisionNote: note || null,
    },
    include: cargoRequestInclude,
  });

  if (existing.driverId) {
    await prisma.notification.create({
      data: {
        userId: existing.driverId,
        type: "quote.rejected",
        message: formatNotifyLines("Macmiilku wuu diiday qiimaha", {
          bookingId: id,
          pickup: existing.pickup,
          destination: existing.destination,
          fromRegion: existing.fromRegion,
          fromDistrict: existing.fromDistrict,
          toRegion: existing.toRegion,
          toDistrict: existing.toDistrict,
          body: note ? `Sabab: ${note}` : undefined,
        }),
      },
    });
  }

  return mapCargoRequest(updated);
},

/** Driver declines a Pending / Quote Rejected booking before sending a price. */
async declineCargoBooking(id, { driverId, note }) {
  const existing = await prisma.cargoRequest.findUnique({
    where: { id },
    include: {
      driver: { select: { name: true } },
      truck: { select: { truckType: true, plateNumber: true, truckNumber: true } },
    },
  });
  if (!existing) return null;
  if (existing.driverId !== driverId) {
    const error = new Error("Not allowed to decline this booking");
    error.status = 403;
    throw error;
  }
  const status = reqStatusToApi(existing.status);
  if (!["Pending", "Quote Rejected"].includes(status)) {
    const error = new Error("Only pending bookings can be declined by the driver");
    error.status = 400;
    throw error;
  }
  if (!note || !String(note).trim()) {
    const error = new Error("Please provide a reason for declining");
    error.status = 400;
    throw error;
  }

  const declinedDriverName = existing.driver?.name || null;
  const declinedTruck = existing.truck || null;

  const updated = await prisma.cargoRequest.update({
    where: { id },
    data: {
      status: "Cancelled",
      customerDecisionNote: String(note).trim(),
      customerDecisionAt: new Date(),
      driverId: null,
      truckId: null,
    },
    include: cargoRequestInclude,
  });

  if (existing.truckId) {
    await prisma.truck.update({
      where: { id: existing.truckId },
      data: { status: "Available" },
    }).catch(() => {});
  }

  await prisma.notification.create({
    data: {
      userId: existing.customerId,
      type: "booking.declined",
      message: formatNotifyLines("Darawalku wuu diiday dalabka", {
        bookingId: id,
        status: "Cancelled",
        customerName: existing.senderName || existing.receiverName || null,
        driverName: declinedDriverName,
        truckType: declinedTruck?.truckType || null,
        plateNumber: declinedTruck?.plateNumber || null,
        truckNumber: declinedTruck?.truckNumber || null,
        pickup: existing.pickup,
        destination: existing.destination,
        fromRegion: existing.fromRegion,
        fromDistrict: existing.fromDistrict,
        toRegion: existing.toRegion,
        toDistrict: existing.toDistrict,
        body: `Sabab: ${String(note).trim()}`,
      }),
    },
  });

  return mapCargoRequest(updated);
},

async assignCargoRequest(id, { driverId, truckId, dispatcherId, fare, estimatedTime } = {}) {
  return withTransaction(async (tx) => {
    const truckCheck = await tx.truck.findFirst({
      where: { id: truckId, driverId },
      include: {
        driver: { select: { id: true, role: true, status: true, serviceType: true, name: true } },
      },
    });
    if (!truckCheck || !truckCheck.driver || truckCheck.driver.role !== "driver") {
      const error = new Error("Truck must belong to the selected driver");
      error.status = 400;
      throw error;
    }

    const current = await tx.cargoRequest.findUnique({ where: { id } });
    if (!current) return null;
    if (current.driverId || current.truckId) {
      const error = new Error("This booking is already linked to a driver and truck");
      error.status = 400;
      throw error;
    }

    const loadType = current.loadType === "SHARED" ? "SHARED" : "FTL";
    const driverServiceType = truckCheck.driver.serviceType === "SHARED" ? "SHARED" : "FTL";
    if (loadType === "SHARED") {
      const error = new Error(
        "SHARED loads must be assigned from Shared Loads (pool assign) to a SHARED driver — not here."
      );
      error.status = 400;
      throw error;
    }
    if (driverServiceType !== "FTL") {
      const error = new Error("FTL loads can only be assigned to an FTL driver.");
      error.status = 400;
      throw error;
    }

    if (truckCheck.driver.status !== "Active") {
      const error = new Error("This driver is not available (inactive). Choose another driver.");
      error.status = 400;
      throw error;
    }

    const truckStatus = String(truckCheck.status || "");
    const unavailableTruck = ["Maintenance", "Unavailable", "Pending Verification", "Pending_Verification"].includes(
      truckStatus
    );
    if (unavailableTruck) {
      const error = new Error(
        `This truck is ${truckStatus.replaceAll("_", " ")}. You cannot assign a load until it is Available.`
      );
      error.status = 400;
      throw error;
    }

    if (truckStatus === "Busy") {
      const inProgressTrips = await tx.trip.count({
        where: {
          OR: [{ truckId }, { driverId }],
          status: {
            notIn: ["Delivered", "Cancelled", "Assigned"],
          },
        },
      });
      // SHARED pool may stack multiple Assigned loads onto one truck before pickup starts.
      // FTL (and any trip already underway) must not get another assignment.
      if (current.loadType !== "SHARED" || inProgressTrips > 0) {
        const error = new Error(
          "This driver/truck is busy with another load. Assign an available truck instead."
        );
        error.status = 400;
        throw error;
      }
    } else if (truckStatus !== "Available") {
      const error = new Error("Selected truck is not available for assignment");
      error.status = 400;
      throw error;
    }

    // Any available truck of the correct service type (FTL/SHARED) may be assigned —
    // do not block on truckType string match (e.g. "ud" vs "truck niic").

    const currentStatus = reqStatusToApi(current.status);
    const assignable = ["Pending", "Awaiting Approval", "Quote Rejected", "Approved", "Assigned"];
    if (!assignable.includes(currentStatus)) {
      const error = new Error(
        `Cannot assign a driver while the request is "${currentStatus}"`
      );
      error.status = 400;
      throw error;
    }

    // Fare is finalized at Delivered from GPS km + pickup weight — not at assign.
    const fareFromBody = fare != null ? Number(fare) : null;
    const suggestedPrice =
      fareFromBody != null && Number.isFinite(fareFromBody) && fareFromBody > 0
        ? Math.round(fareFromBody * 100) / 100
        : null;

    const tripEta =
      (estimatedTime != null && String(estimatedTime).trim()) ||
      current.quotedEstimatedTime ||
      null;

    const quoteFields = {
      ...(suggestedPrice != null ? { quotedPrice: suggestedPrice, finalPrice: suggestedPrice } : {}),
      ...(tripEta ? { quotedEstimatedTime: tripEta } : {}),
    };

    const tripFare = suggestedPrice != null ? suggestedPrice : 0;

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
          distance: null,
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
    if (!payment && tripFare > 0) {
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
          description: `Shipment ${tripId} — pay 100% after delivery`,
        },
      });
    }

    const customerRow = await tx.user.findUnique({
      where: { id: updated.customerId },
      select: { name: true },
    });
    const customerName =
      current.senderName || current.receiverName || customerRow?.name || null;
    const driverName = truckCheck.driver?.name || null;
    const truckFields = {
      truckType: truckCheck.truckType || current.truckType || null,
      plateNumber: truckCheck.plateNumber || null,
      truckNumber: truckCheck.truckNumber || null,
    };
    const routeFields = {
      pickup: updated.pickup || current.pickup,
      destination: updated.destination || current.destination,
      fromRegion: current.fromRegion,
      fromDistrict: current.fromDistrict,
      toRegion: current.toRegion,
      toDistrict: current.toDistrict,
    };

    const notification = await tx.notification.create({
      data: {
        userId: driverId,
        type: "driver.assigned",
        message: formatNotifyLines("Dalab cusub — Accept ama Reject", {
          bookingId: id,
          tripId,
          status: "Assigned",
          customerName,
          driverName,
          ...truckFields,
          ...routeFields,
          body: "Fadlan aqbal ama diid shaqadan.",
        }),
      },
    });

    await tx.notification.create({
      data: {
        userId: updated.customerId,
        type: "booking.assigned",
        message: formatCustomerNotifyLine(TRIP_NOTIFY.assigned, {
          bookingId: id,
          tripId,
          status: "Assigned",
          customerName,
          driverName,
          ...truckFields,
          ...routeFields,
        }),
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
    const nonCancelable = ["Picked Up", "In Transit", "Near Destination", "Delivered", "Cancelled"];
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
        message: formatNotifyLines("Dalabka waa la joojiyay", {
          bookingId: id,
          status: "Cancelled",
          customerName: existing.senderName || existing.receiverName || null,
          pickup: existing.pickup,
          destination: existing.destination,
          fromRegion: existing.fromRegion,
          fromDistrict: existing.fromDistrict,
          toRegion: existing.toRegion,
          toDistrict: existing.toDistrict,
        }),
      },
    });

    if (actorId && actorId !== existing.customerId) {
      await tx.notification.create({
        data: {
          userId: actorId,
          type: "order.cancelled",
          message: formatNotifyLines("Dalabka waa la joojiyay (admin)", {
            bookingId: id,
            status: "Cancelled",
            pickup: existing.pickup,
            destination: existing.destination,
            fromRegion: existing.fromRegion,
            fromDistrict: existing.fromDistrict,
            toRegion: existing.toRegion,
            toDistrict: existing.toDistrict,
          }),
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
        message: formatNotifyLines(`Dalabka waa la soo celiyay → ${status}`, {
          bookingId: id,
          status,
          customerName: existing.senderName || existing.receiverName || null,
          pickup: existing.pickup,
          destination: existing.destination,
          fromRegion: existing.fromRegion,
          fromDistrict: existing.fromDistrict,
          toRegion: existing.toRegion,
          toDistrict: existing.toDistrict,
        }),
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

async updateCargoImageUrl(id, url) {
  const updated = await prisma.cargoRequest.update({
    where: { id },
    data: { cargoImageUrl: url },
    include: cargoRequestInclude,
  });
  return mapCargoRequest(updated);
},

};
