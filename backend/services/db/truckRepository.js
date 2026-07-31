import { prisma, withTransaction } from "../../lib/prisma.js";
import { mapTruck } from "./mappers.js";

function mapPublicTruck(row) {
  const driverActive = row.driver?.status === "Active";
  const truckAvailable = row.status === "Available";
  return {
    id: row.id,
    truckNumber: row.truckNumber,
    plateNumber: row.plateNumber,
    capacity: row.capacity,
    capacityTons: row.capacityTons != null ? Number(row.capacityTons) : null,
    truckType: row.truckType,
    type: row.truckType,
    status: row.status,
    region: row.region || null,
    city: row.city || null,
    photoUrl1: row.photoUrl1 || null,
    photoUrl2: row.photoUrl2 || null,
    serviceType: "FTL",
    driver: row.driver?.name ? row.driver.name.split(" ")[0] : null,
    driverName: row.driver?.name || null,
    driverStatus: row.driver?.status || null,
    bookable: driverActive && truckAvailable,
    verificationPending: !driverActive || !truckAvailable,
  };
}

export const truckRepository = {
async listTrucks({ status, search, page = 1, limit = 50 } = {}) {
  const where = {};
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
  const truck = await prisma.truck.create({
    data: {
      truckNumber: payload.truckNumber,
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
  if (payload.truckNumber !== undefined) data.truckNumber = payload.truckNumber;
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


async listTruckTypes() {
  return prisma.truckType.findMany({ orderBy: { name: "asc" } });
},

async listPublicTrucks({ region, city, truckType, search, page = 1, limit = 48 } = {}) {
  const where = {
    status: { in: ["Available", "Pending_Verification"] },
    driver: {
      role: "driver",
      status: { in: ["Active", "Pending Verification"] },
      OR: [{ serviceType: "FTL" }, { serviceType: null }],
    },
  };
  if (region) where.region = { equals: region, mode: "insensitive" };
  if (city) where.city = { equals: city, mode: "insensitive" };
  if (truckType) where.truckType = { contains: truckType, mode: "insensitive" };
  if (search) {
    where.AND = [
      {
        OR: [
          { truckNumber: { contains: search, mode: "insensitive" } },
          { plateNumber: { contains: search, mode: "insensitive" } },
          { truckType: { contains: search, mode: "insensitive" } },
          { region: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
          { driver: { name: { contains: search, mode: "insensitive" } } },
        ],
      },
    ];
  }

  const take = Number(limit);
  const skip = (Number(page) - 1) * take;
  const rows = await prisma.truck.findMany({
    where,
    include: { driver: { select: { id: true, name: true, phone: true, serviceType: true, status: true } } },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });

  const data = rows.map((row) => mapPublicTruck(row));
  const total = await prisma.truck.count({ where });
  return { data, total, page: Number(page) };
},

async getPublicTruck(id) {
  const row = await prisma.truck.findFirst({
    where: {
      id,
      status: { in: ["Available", "Pending_Verification"] },
      driver: {
        role: "driver",
        status: { in: ["Active", "Pending Verification"] },
        OR: [{ serviceType: "FTL" }, { serviceType: null }],
      },
    },
    include: { driver: { select: { id: true, name: true, phone: true, serviceType: true, status: true } } },
  });
  return row ? mapPublicTruck(row) : null;
},


};
