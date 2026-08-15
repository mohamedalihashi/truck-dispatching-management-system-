import { prisma, withTransaction } from "../../lib/prisma.js";
import { generateTruckId } from "../../lib/truckId.js";
import { mapTruck } from "./mappers.js";

export const truckRepository = {
async listTrucks({ status, search, page = 1, limit = 50, driverId } = {}) {
  const where = {};
  if (driverId) where.driverId = driverId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { truckNumber: { contains: search, mode: "insensitive" } },
      { plateNumber: { contains: search, mode: "insensitive" } },
      { truckType: { contains: search, mode: "insensitive" } },
      { city: { contains: search, mode: "insensitive" } },
      { region: { contains: search, mode: "insensitive" } },
      { driver: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  const offset = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    prisma.truck.findMany({
      where,
      include: { driver: true },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: offset,
    }),
    prisma.truck.count({ where }),
  ]);
  return { data: data.map(mapTruck), total, page: Number(page) };
},

async truckSummary() {
  const [total, active, busy, maintenance, inactive] = await Promise.all([
    prisma.truck.count(),
    prisma.truck.count({ where: { status: "Available" } }),
    prisma.truck.count({ where: { status: "Busy" } }),
    prisma.truck.count({ where: { status: "Maintenance" } }),
    prisma.truck.count({ where: { driver: { status: "Inactive" } } }),
  ]);

  return { total, active, inactive, busy, maintenance };
},

async createTruck(payload) {
  const truckNumber = payload.truckNumber?.trim() || generateTruckId();
  const truck = await prisma.truck.create({
    data: {
      truckNumber,
      plateNumber: payload.plateNumber,
      capacity: payload.capacity,
      truckType: payload.truckType || payload.type,
      region: payload.region || "",
      city: payload.city || "",
      driverId: payload.driverId,
      status: payload.status || "Available",
    },
    include: { driver: true },
  });
  return mapTruck(truck);
},

async deleteTruck(id) {
  return withTransaction(async (tx) => {
    const truck = await tx.truck.findUnique({ where: { id } });
    if (!truck) return false;

    const activeTrip = await tx.trip.findFirst({
      where: {
        truckId: id,
        status: { notIn: ["Delivered", "Cancelled"] },
      },
    });
    if (activeTrip) {
      const error = new Error("Cannot delete truck with active trips");
      error.status = 400;
      throw error;
    }

    await tx.truck.delete({ where: { id } });
    return true;
  });
},

async updateTruck(id, payload, { driverId } = {}) {
  const existing = await prisma.truck.findUnique({ where: { id } });
  if (!existing) return null;
  if (driverId) {
    if (existing.driverId !== driverId) {
      const error = new Error("Not allowed to update this truck");
      error.status = 403;
      throw error;
    }
    payload = { status: payload.status };
    if (!payload.status) {
      const error = new Error("Drivers can only update truck status");
      error.status = 400;
      throw error;
    }
  }

  const data = {};
  if (payload.truckNumber !== undefined) {
    // Truck ID is system-generated; do not allow clients to blank it out.
    if (String(payload.truckNumber).trim()) data.truckNumber = String(payload.truckNumber).trim();
  }
  if (payload.plateNumber !== undefined) data.plateNumber = payload.plateNumber;
  if (payload.capacity !== undefined) data.capacity = payload.capacity;
  if (payload.truckType !== undefined) data.truckType = payload.truckType;
  if (payload.type !== undefined) data.truckType = payload.type;
  if (payload.city !== undefined) data.city = payload.city;
  if (payload.region !== undefined) data.region = payload.region;
  if (payload.status !== undefined) data.status = payload.status;
  if (payload.driverId !== undefined) data.driverId = payload.driverId;

  if (Object.keys(data).length > 0) {
    await prisma.truck.update({ where: { id }, data });
  }
  const truck = await prisma.truck.findUnique({
    where: { id },
    include: { driver: true },
  });
  return mapTruck(truck);
},


};
