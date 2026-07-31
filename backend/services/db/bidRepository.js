import { prisma, withTransaction } from "../../lib/prisma.js";
import { mapCargoRequest, mapUser, cargoRequestInclude } from "./mappers.js";
import { buildWaafiReferenceId } from "../waafiPayService.js";

function sharedStatusToApi(s) {
  return s ? String(s).replace(/_/g, " ") : s;
}

export function mapBid(row) {
  if (!row) return null;
  return {
    id: row.id,
    cargoRequestId: row.cargoRequestId,
    driverId: row.driverId,
    truckId: row.truckId,
    amount: Number(row.amount || 0),
    estimatedDays: row.estimatedDays,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    driver: row.driver?.name || null,
    driverPhone: row.driver?.phone || null,
    truck: row.truck?.truckNumber || null,
    cargoRequest: row.cargoRequest ? mapCargoRequest(row.cargoRequest) : null,
  };
}

export const bidRepository = {
  async listFtlMarketplace({ search, region, truckType, page = 1, limit = 50 } = {}) {
    const where = {
      loadType: "FTL",
      status: { in: ["Pending", "Awaiting_Approval", "Approved"] },
      driverId: null,
    };
    if (truckType) where.truckType = { contains: truckType, mode: "insensitive" };
    if (region) {
      where.OR = [
        { fromRegion: { equals: region, mode: "insensitive" } },
        { toRegion: { equals: region, mode: "insensitive" } },
      ];
    }
    if (search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { id: { contains: search, mode: "insensitive" } },
            { pickup: { contains: search, mode: "insensitive" } },
            { destination: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { truckType: { contains: search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const take = Number(limit);
    const skip = (Number(page) - 1) * take;
    const [data, total] = await Promise.all([
      prisma.cargoRequest.findMany({
        where,
        include: cargoRequestInclude,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.cargoRequest.count({ where }),
    ]);
    return { data: data.map(mapCargoRequest), total, page: Number(page) };
  },

  async listBidsForDriver(driverId, { status, page = 1, limit = 50 } = {}) {
    const where = { driverId };
    if (status) where.status = status;
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [data, total] = await Promise.all([
      prisma.bid.findMany({
        where,
        include: {
          cargoRequest: { include: cargoRequestInclude },
          truck: true,
          driver: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.bid.count({ where }),
    ]);
    return {
      data: data.map(mapBid),
      total,
      pagination: {
        page: Math.max(Number(page) || 1, 1),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },

  async listBidsForRequest(cargoRequestId, { page = 1, limit = 50 } = {}) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where = { cargoRequestId };
    const [data, total] = await Promise.all([
      prisma.bid.findMany({
        where,
        include: {
          driver: { select: { id: true, name: true, phone: true } },
          truck: true,
        },
        orderBy: { amount: "asc" },
        take,
        skip,
      }),
      prisma.bid.count({ where }),
    ]);
    return {
      data: data.map(mapBid),
      total,
      pagination: {
        page: Math.max(Number(page) || 1, 1),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },

  async createBid({ cargoRequestId, driverId, amount, estimatedDays, notes }) {
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      include: { truck: true },
    });
    if (!driver || driver.role !== "driver") {
      const error = new Error("Driver account required");
      error.status = 403;
      throw error;
    }
    if (driver.serviceType === "SHARED") {
      const error = new Error("Only FTL drivers can bid on full-load requests");
      error.status = 403;
      throw error;
    }
    if (driver.status !== "Active") {
      const error = new Error("Driver account is not active");
      error.status = 403;
      throw error;
    }

    const request = await prisma.cargoRequest.findUnique({ where: { id: cargoRequestId } });
    if (!request || request.loadType !== "FTL") {
      const error = new Error("FTL cargo request not found");
      error.status = 404;
      throw error;
    }
    if (!["Pending", "Awaiting_Approval", "Approved"].includes(request.status) || request.driverId) {
      const error = new Error("This request is no longer open for bids");
      error.status = 400;
      throw error;
    }

    const existing = await prisma.bid.findUnique({
      where: { cargoRequestId_driverId: { cargoRequestId, driverId } },
    });
    if (existing && existing.status !== "Withdrawn") {
      const error = new Error("You already have an active bid on this request");
      error.status = 409;
      throw error;
    }

    const bid = existing
      ? await prisma.bid.update({
          where: { id: existing.id },
          data: {
            amount,
            estimatedDays: estimatedDays ?? null,
            notes: notes || null,
            status: "Pending",
            truckId: driver.truck?.id || null,
          },
          include: { driver: true, truck: true, cargoRequest: { include: cargoRequestInclude } },
        })
      : await prisma.bid.create({
          data: {
            cargoRequestId,
            driverId,
            truckId: driver.truck?.id || null,
            amount,
            estimatedDays: estimatedDays ?? null,
            notes: notes || null,
          },
          include: { driver: true, truck: true, cargoRequest: { include: cargoRequestInclude } },
        });

    await prisma.notification.create({
      data: {
        userId: request.customerId,
        type: "bid.created",
        message: `New bid of $${Number(amount).toFixed(2)} on request ${cargoRequestId}`,
      },
    });

    return mapBid(bid);
  },

  async updateBid(id, driverId, { amount, estimatedDays, notes }) {
    const bid = await prisma.bid.findUnique({ where: { id } });
    if (!bid || bid.driverId !== driverId) {
      const error = new Error("Bid not found");
      error.status = 404;
      throw error;
    }
    if (bid.status !== "Pending") {
      const error = new Error("Only pending bids can be edited");
      error.status = 400;
      throw error;
    }
    const updated = await prisma.bid.update({
      where: { id },
      data: {
        ...(amount !== undefined ? { amount } : {}),
        ...(estimatedDays !== undefined ? { estimatedDays } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      include: { driver: true, truck: true, cargoRequest: { include: cargoRequestInclude } },
    });
    return mapBid(updated);
  },

  async withdrawBid(id, driverId) {
    const bid = await prisma.bid.findUnique({ where: { id } });
    if (!bid || bid.driverId !== driverId) {
      const error = new Error("Bid not found");
      error.status = 404;
      throw error;
    }
    if (bid.status !== "Pending") {
      const error = new Error("Only pending bids can be withdrawn");
      error.status = 400;
      throw error;
    }
    const updated = await prisma.bid.update({
      where: { id },
      data: { status: "Withdrawn" },
      include: { driver: true, truck: true, cargoRequest: { include: cargoRequestInclude } },
    });
    return mapBid(updated);
  },

  async acceptBid({ bidId, customerId }) {
    return withTransaction(async (tx) => {
      const bid = await tx.bid.findUnique({
        where: { id: bidId },
        include: { cargoRequest: true, driver: { include: { truck: true } } },
      });
      if (!bid || bid.status !== "Pending") {
        const error = new Error("Bid not available");
        error.status = 400;
        throw error;
      }
      if (bid.cargoRequest.customerId !== customerId) {
        const error = new Error("Not allowed to accept this bid");
        error.status = 403;
        throw error;
      }
      if (bid.cargoRequest.driverId) {
        const error = new Error("Request already assigned");
        error.status = 400;
        throw error;
      }

      await tx.bid.update({ where: { id: bidId }, data: { status: "Accepted" } });
      await tx.bid.updateMany({
        where: {
          cargoRequestId: bid.cargoRequestId,
          id: { not: bidId },
          status: "Pending",
        },
        data: { status: "Rejected" },
      });

      const request = await tx.cargoRequest.update({
        where: { id: bid.cargoRequestId },
        data: {
          status: "Assigned",
          driverId: bid.driverId,
          truckId: bid.truckId || bid.driver.truck?.id || null,
          quotedPrice: bid.amount,
          finalPrice: bid.amount,
          customerDecisionAt: new Date(),
        },
      });

      const tripId = `TRP-${Date.now().toString(36).toUpperCase()}`;
      const trip = await tx.trip.create({
        data: {
          id: tripId,
          cargoRequestId: request.id,
          customerId: request.customerId,
          driverId: bid.driverId,
          truckId: bid.truckId || bid.driver.truck?.id || null,
          pickup: request.pickup,
          destination: request.destination,
          distance: request.distanceKm != null ? `${request.distanceKm} km` : null,
          estimatedTime: bid.estimatedDays != null ? `${bid.estimatedDays} day(s)` : null,
          status: "Assigned",
          fare: bid.amount,
        },
      });

      await tx.payment.create({
        data: {
          tripId,
          customerId: request.customerId,
          amount: bid.amount,
          amountPaid: 0,
          status: "Pending",
          method: "waafipay",
          provider: "waafipay",
          currency: process.env.WAAFI_CURRENCY || "SLSH",
          referenceId: buildWaafiReferenceId(tripId),
          description: `Shipment ${tripId} — 30% deposit required before trip can start; 70% after delivery`,
        },
      });

      if (bid.truckId || bid.driver.truck?.id) {
        await tx.truck.update({
          where: { id: bid.truckId || bid.driver.truck.id },
          data: { status: "Busy" },
        });
      }

      await tx.notification.create({
        data: {
          userId: bid.driverId,
          type: "bid.accepted",
          message: `Your bid was accepted for ${request.id}. Trip starts after the customer pays the 30% deposit.`,
        },
      });

      return { bid: mapBid(bid), tripId: trip.id, requestId: request.id };
    });
  },
};
