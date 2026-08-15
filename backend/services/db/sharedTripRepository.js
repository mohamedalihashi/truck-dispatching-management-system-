import { prisma, withTransaction } from "../../lib/prisma.js";
import { mapCargoRequest, cargoRequestInclude, reqStatusToApi } from "./mappers.js";
import { buildWaafiReferenceId } from "../waafiPayService.js";
import { auditFields } from "../../lib/auditContext.js";
import { fareFromTraveledKm } from "../pricingRates.js";
import {
  TRIP_NOTIFY,
  formatCustomerNotifyLine,
  formatNotifyLines,
  deliveryConfirmCode,
} from "../../lib/tripCustomerMessages.js";
import {
  formatMeasuredQuantity,
  validateMeasuredQuantity,
  resolvePickupMeasurements,
} from "../../lib/cargoMeasurement.js";

/** Capacity always comes from the registered truck — never from free-form input. */
function resolveTruckCapacityTons(truck) {
  if (!truck) return 0;
  const tons = Number(truck.capacityTons);
  if (Number.isFinite(tons) && tons > 0) return tons;
  const fromLabel = Number(String(truck.capacity || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(fromLabel) && fromLabel > 0 ? fromLabel : 0;
}

function parseWeightTons(weight) {
  const raw = String(weight || "").trim();
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (raw.toLowerCase().includes("kg")) return n / 1000;
  return n;
}

function normalizePlace(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Shared loads may only pool when they share the same corridor:
 * same pickup gobol+magalo (region+district) AND same delivery gobol+magalo.
 * Neighborhood can differ within the same city.
 */
export function sharedCorridorKey(request) {
  const fromRegion = normalizePlace(request?.fromRegion);
  const fromDistrict = normalizePlace(request?.fromDistrict);
  const toRegion = normalizePlace(request?.toRegion);
  const toDistrict = normalizePlace(request?.toDistrict);

  const from =
    fromRegion && fromDistrict
      ? `${fromRegion}::${fromDistrict}`
      : normalizePlace(request?.pickup);
  const to =
    toRegion && toDistrict
      ? `${toRegion}::${toDistrict}`
      : normalizePlace(request?.destination);

  if (!from || !to) return "";
  return `${from}=>${to}`;
}

function assertSharedLoadsSameCorridor(requests) {
  if (!requests?.length) return;
  const keys = requests.map((r) => ({ id: r.id, key: sharedCorridorKey(r) }));
  const missing = keys.find((row) => !row.key);
  if (missing) {
    const error = new Error(
      `Request ${missing.id} is missing region/district. Shared loads need the same gobol + magalo (pickup and delivery).`
    );
    error.status = 400;
    throw error;
  }
  const primary = keys[0].key;
  const mismatch = keys.find((row) => row.key !== primary);
  if (mismatch) {
    const error = new Error(
      "Shared loads on different routes cannot share one truck. Only requests with the same gobol + magalo (pickup and delivery) can be pooled."
    );
    error.status = 400;
    throw error;
  }
}

/** Statuses that block publishing another shared trip. */
const ACTIVE_SHARED_STATUSES = ["Assigned", "Open for booking", "Full", "Pickup", "In Transit", "Departed"];

const TERMINAL_SHARED_STATUSES = ["Delivered", "Completed", "Cancelled"];

function parseDepartureDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapSharedTrip(row, { includeDriverPhone = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    driverId: row.driverId,
    driver: row.driver?.name || null,
    driverPhone: includeDriverPhone ? row.driver?.phone || null : null,
    truckId: row.truckId,
    truck: row.truck?.truckNumber || null,
    truckType: row.truck?.truckType || null,
    plateNumber: row.truck?.plateNumber || null,
    pickup: row.pickup,
    destination: row.destination,
    fromRegion: row.fromRegion,
    fromDistrict: row.fromDistrict,
    toRegion: row.toRegion,
    toDistrict: row.toDistrict,
    departureDate: row.departureDate,
    durationAmount: row.durationAmount != null ? Number(row.durationAmount) : null,
    durationUnit: row.durationUnit || null,
    totalCapacityTons: row.totalCapacityTons != null ? Number(row.totalCapacityTons) : null,
    availableTons: row.availableTons != null ? Number(row.availableTons) : null,
    pricePerTon: row.pricePerTon != null ? Number(row.pricePerTon) : null,
    notes: row.notes,
    status: row.status,
    bookingsCount: row._count?.bookings ?? row.bookings?.length ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const sharedTripInclude = {
  driver: { select: { id: true, name: true, phone: true, serviceType: true } },
  truck: true,
  _count: { select: { bookings: true } },
};

/** Create shipment. Final fare + invoice are set at Delivered from GPS km. */
async function createBookingTripAndPayment(tx, { request, sharedTrip, bookingId = null }) {
  if (!request) return null;

  const fare =
    request.finalPrice != null
      ? Number(request.finalPrice)
      : request.quotedPrice != null
        ? Number(request.quotedPrice)
        : 0;

  let trip = await tx.trip.findFirst({ where: { cargoRequestId: request.id } });
  if (!trip) {
    const tripId = `SHP-${Math.floor(10000 + Math.random() * 9000)}`;
    trip = await tx.trip.create({
      data: {
        id: tripId,
        cargoRequestId: request.id,
        customerId: request.customerId,
        driverId: sharedTrip.driverId,
        truckId: sharedTrip.truckId,
        pickup: request.pickup || sharedTrip.pickup,
        destination: request.destination || sharedTrip.destination,
        distance: request.distanceKm != null ? `${request.distanceKm} km` : null,
        estimatedTime: request.quotedEstimatedTime,
        status: "Assigned",
        fare: Number.isFinite(fare) && fare > 0 ? fare : 0,
      },
    });
  }

  // Invoice only when fare is known (Delivered / GPS).
  if (fare > 0) {
    const existingPayment = await tx.payment.findFirst({
      where: { tripId: trip.id },
      orderBy: { createdAt: "desc" },
    });
    if (!existingPayment) {
      await tx.payment.create({
        data: {
          tripId: trip.id,
          customerId: request.customerId,
          amount: fare,
          amountPaid: 0,
          status: "Pending",
          method: "waafipay",
          provider: "waafipay",
          currency: process.env.WAAFI_CURRENCY || "SLSH",
          referenceId: buildWaafiReferenceId(trip.id),
          description: `Shared trip ${sharedTrip.id} / ${trip.id} — pay 100% after delivery`,
        },
      });
    }
  }

  const advancedStatuses = new Set([
    "Assigned",
    "Picked_Up",
    "En_Route_to_Pickup",
    "Arrived_at_Pickup",
    "In_Transit",
    "Near_Destination",
    "Delivered",
  ]);
  if (!advancedStatuses.has(String(request.status || ""))) {
    await tx.cargoRequest.update({
      where: { id: request.id },
      data: { status: "Assigned" },
    });
  }

  if (bookingId) {
    await tx.sharedTripBooking.update({
      where: { id: bookingId },
      data: { status: "Confirmed" },
    });
  }

  return trip;
}

export const sharedTripRepository = {
  async sharedTripsSummary({ driverId } = {}) {
    const where = driverId ? { driverId } : {};
    const [total, assigned, open, full, pickup, inTransit, delivered] = await Promise.all([
      prisma.sharedTrip.count({ where }),
      prisma.sharedTrip.count({ where: { ...where, status: "Assigned" } }),
      prisma.sharedTrip.count({ where: { ...where, status: "Open for booking" } }),
      prisma.sharedTrip.count({ where: { ...where, status: "Full" } }),
      prisma.sharedTrip.count({
        where: { ...where, status: { in: ["Pickup", "Departed"] } },
      }),
      prisma.sharedTrip.count({ where: { ...where, status: "In Transit" } }),
      prisma.sharedTrip.count({
        where: { ...where, status: { in: ["Delivered", "Completed"] } },
      }),
    ]);
    return {
      total,
      assigned,
      open,
      full,
      pickup,
      inTransit,
      delivered,
      // legacy keys used by older UI
      departed: pickup,
      completed: delivered,
    };
  },

  async listSharedTrips({
    driverId,
    status,
    search,
    page = 1,
    limit = 50,
    publicOnly = false,
    excludeTerminal = false,
  } = {}) {
    const where = {};
    if (driverId) where.driverId = driverId;
    if (status) where.status = status;
    if (excludeTerminal && !status) {
      where.status = { notIn: TERMINAL_SHARED_STATUSES };
    }
    if (publicOnly) {
      where.status = "Open for booking";
      where.availableTons = { gt: 0 };
    }
    if (search) {
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { pickup: { contains: search, mode: "insensitive" } },
        { destination: { contains: search, mode: "insensitive" } },
        { fromRegion: { contains: search, mode: "insensitive" } },
        { toRegion: { contains: search, mode: "insensitive" } },
      ];
    }

    const take = Number(limit);
    const skip = (Number(page) - 1) * take;
    const [data, total] = await Promise.all([
      prisma.sharedTrip.findMany({
        where,
        include: sharedTripInclude,
        orderBy: { departureDate: "asc" },
        take,
        skip,
      }),
      prisma.sharedTrip.count({ where }),
    ]);
    return {
      data: data.map((row) => mapSharedTrip(row, { includeDriverPhone: !publicOnly })),
      total,
      page: Number(page),
    };
  },

  async getSharedTripById(id, { includeDriverPhone = false, includeCustomerPhone = false } = {}) {
    const row = await prisma.sharedTrip.findUnique({
      where: { id },
      include: {
        ...sharedTripInclude,
        bookings: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            cargoRequest: {
              include: {
                ...cargoRequestInclude,
                trips: { select: { id: true, status: true, lastLat: true, lastLng: true, distanceTraveledKm: true } },
              },
            },
          },
        },
      },
    });
    if (!row) return null;
    return {
      ...mapSharedTrip(row, { includeDriverPhone }),
      bookings: (row.bookings || []).map((b) => ({
        id: b.id,
        customerId: b.customerId,
        customer: b.customer?.name || null,
        customerPhone: includeCustomerPhone ? b.customer?.phone || null : null,
        weightTons: Number(b.weightTons),
        status: b.status,
        pickupOrder: b.pickupOrder ?? null,
        deliveryOrder: b.deliveryOrder ?? null,
        cargoRequestId: b.cargoRequestId,
        tripId: b.cargoRequest?.trips?.[0]?.id || null,
        tripStatus: b.cargoRequest?.trips?.[0]?.status || null,
        cargoRequest: b.cargoRequest ? mapCargoRequest(b.cargoRequest) : null,
        createdAt: b.createdAt,
      })),
    };
  },

  async createSharedTrip(payload) {
    const driver = await prisma.user.findUnique({
      where: { id: payload.driverId },
      include: { truck: true },
    });
    if (!driver || driver.role !== "driver") {
      const error = new Error("Driver account required");
      error.status = 403;
      throw error;
    }
    if (driver.serviceType !== "SHARED") {
      const error = new Error("Only SHARED drivers can create shared trips");
      error.status = 403;
      throw error;
    }
    if (driver.status !== "Active") {
      const error = new Error("Driver account must be verified before creating shared trips");
      error.status = 403;
      throw error;
    }
    if (!driver.truck) {
      const error = new Error("Driver has no registered truck");
      error.status = 400;
      throw error;
    }

    const total = resolveTruckCapacityTons(driver.truck);
    if (!(total > 0)) {
      const error = new Error("Your truck has no registered capacity (tons). Update truck details first.");
      error.status = 400;
      throw error;
    }

    const departureDate = parseDepartureDate(payload.departureDate);
    if (!departureDate) {
      const error = new Error("Departure date is required");
      error.status = 400;
      throw error;
    }

    const durationAmount = Number(payload.durationAmount);
    const durationUnit = String(payload.durationUnit || "").toLowerCase();
    if (!(durationAmount > 0) || !["hours", "days"].includes(durationUnit)) {
      const error = new Error("Duration is required (hours or days)");
      error.status = 400;
      throw error;
    }

    const activeCount = await prisma.sharedTrip.count({
      where: {
        driverId: payload.driverId,
        status: { in: ACTIVE_SHARED_STATUSES },
      },
    });
    if (activeCount > 0) {
      const error = new Error("Finish your current shared trip before publishing a new one");
      error.status = 400;
      throw error;
    }

    const sameDateCount = await prisma.sharedTrip.count({
      where: {
        driverId: payload.driverId,
        departureDate,
        status: { notIn: ["Cancelled"] },
      },
    });
    if (sameDateCount > 0) {
      const error = new Error("You already have a shared trip on this departure date");
      error.status = 400;
      throw error;
    }

    const id = `ST-${Date.now().toString(36).toUpperCase()}`;
    const row = await prisma.sharedTrip.create({
      data: {
        id,
        driverId: payload.driverId,
        truckId: driver.truck.id,
        pickup: payload.pickup,
        destination: payload.destination,
        fromRegion: payload.fromRegion || null,
        fromDistrict: payload.fromDistrict || null,
        toRegion: payload.toRegion || null,
        toDistrict: payload.toDistrict || null,
        departureDate,
        durationAmount,
        durationUnit,
        totalCapacityTons: total,
        availableTons: total,
        pricePerTon: payload.pricePerTon != null ? Number(payload.pricePerTon) : null,
        notes: payload.notes || null,
        status: "Open for booking",
      },
      include: sharedTripInclude,
    });
    return mapSharedTrip(row);
  },

  async updateSharedTrip(id, driverId, payload) {
    const existing = await prisma.sharedTrip.findUnique({ where: { id } });
    if (!existing || existing.driverId !== driverId) {
      const error = new Error("Shared trip not found");
      error.status = 404;
      throw error;
    }
    if (!["Open for booking", "Draft"].includes(existing.status)) {
      const error = new Error("Only open trips can be edited");
      error.status = 400;
      throw error;
    }

    const data = {};
    if (payload.pickup !== undefined) data.pickup = payload.pickup;
    if (payload.destination !== undefined) data.destination = payload.destination;
    if (payload.fromRegion !== undefined) data.fromRegion = payload.fromRegion;
    if (payload.fromDistrict !== undefined) data.fromDistrict = payload.fromDistrict;
    if (payload.toRegion !== undefined) data.toRegion = payload.toRegion;
    if (payload.toDistrict !== undefined) data.toDistrict = payload.toDistrict;
    if (payload.departureDate !== undefined) {
      const departureDate = parseDepartureDate(payload.departureDate);
      if (!departureDate) {
        const error = new Error("Departure date is required");
        error.status = 400;
        throw error;
      }
      const sameDateCount = await prisma.sharedTrip.count({
        where: {
          driverId,
          departureDate,
          status: { notIn: ["Cancelled"] },
          NOT: { id },
        },
      });
      if (sameDateCount > 0) {
        const error = new Error("You already have a shared trip on this departure date");
        error.status = 400;
        throw error;
      }
      data.departureDate = departureDate;
    }
    if (payload.durationAmount !== undefined || payload.durationUnit !== undefined) {
      const durationAmount = Number(
        payload.durationAmount !== undefined ? payload.durationAmount : existing.durationAmount
      );
      const durationUnit = String(
        payload.durationUnit !== undefined ? payload.durationUnit : existing.durationUnit || ""
      ).toLowerCase();
      if (!(durationAmount > 0) || !["hours", "days"].includes(durationUnit)) {
        const error = new Error("Duration is required (hours or days)");
        error.status = 400;
        throw error;
      }
      data.durationAmount = durationAmount;
      data.durationUnit = durationUnit;
    }
    if (payload.pricePerTon !== undefined) data.pricePerTon = payload.pricePerTon != null ? Number(payload.pricePerTon) : null;
    if (payload.notes !== undefined) data.notes = payload.notes || null;

    const row = await prisma.sharedTrip.update({
      where: { id },
      data,
      include: sharedTripInclude,
    });
    return mapSharedTrip(row);
  },

  async publishSharedTrip(id, driverId) {
    const row = await prisma.sharedTrip.findUnique({ where: { id } });
    if (!row || row.driverId !== driverId) {
      const error = new Error("Shared trip not found");
      error.status = 404;
      throw error;
    }
    const updated = await prisma.sharedTrip.update({
      where: { id },
      data: { status: "Open for booking" },
      include: sharedTripInclude,
    });
    return mapSharedTrip(updated);
  },

  async cancelSharedTrip(id, driverId) {
    const row = await prisma.sharedTrip.findUnique({ where: { id } });
    if (!row || row.driverId !== driverId) {
      const error = new Error("Shared trip not found");
      error.status = 404;
      throw error;
    }
    if (row.status === "Assigned") {
      const error = new Error("Use Reject to decline this assignment");
      error.status = 400;
      throw error;
    }
    if ([...TERMINAL_SHARED_STATUSES, "Pickup", "In Transit", "Departed"].includes(row.status)) {
      const error = new Error(`Cannot cancel a trip that is ${row.status}`);
      error.status = 400;
      throw error;
    }
    const updated = await prisma.sharedTrip.update({
      where: { id },
      data: { status: "Cancelled" },
      include: sharedTripInclude,
    });
    return mapSharedTrip(updated);
  },

  /**
   * Driver accepts the whole shared assignment (one action for all loads on the same corridor).
   */
  async acceptSharedTrip(id, driverId) {
    return withTransaction(async (tx) => {
      const row = await tx.sharedTrip.findUnique({
        where: { id },
        include: {
          bookings: {
            include: {
              cargoRequest: { include: { trips: true } },
            },
          },
        },
      });
      if (!row || row.driverId !== driverId) {
        const error = new Error("Shared trip not found");
        error.status = 404;
        throw error;
      }
      if (row.status !== "Assigned") {
        const error = new Error("Only Assigned shared trips can be accepted");
        error.status = 400;
        throw error;
      }
      if (!row.bookings?.length) {
        const error = new Error("No loads on this shared trip");
        error.status = 400;
        throw error;
      }

      const availableTons = Number(row.availableTons) || 0;
      const nextStatus = availableTons <= 0.001 ? "Full" : "Open for booking";

      for (const booking of row.bookings) {
        const childTrip = booking.cargoRequest?.trips?.[0];
        if (childTrip && ["Assigned", "ASSIGNED"].includes(String(childTrip.status))) {
          await tx.trip.update({
            where: { id: childTrip.id },
            data: { status: "En_Route_to_Pickup" },
          });
        }
      }

      const updated = await tx.sharedTrip.update({
        where: { id },
        data: { status: nextStatus },
        include: sharedTripInclude,
      });

      await tx.notification.create({
        data: {
          userId: driverId,
          type: "shared.accepted",
          message: `${id} accepted — ${row.bookings.length} load(s) on one route. Gather cargo, then start pickup.`,
        },
      });

      return mapSharedTrip(updated);
    });
  },

  /**
   * Driver rejects the whole shared assignment — all loads return to Pending for admin reassign.
   */
  async rejectSharedTrip(id, driverId) {
    return withTransaction(async (tx) => {
      const row = await tx.sharedTrip.findUnique({
        where: { id },
        include: {
          driver: { select: { id: true, name: true } },
          truck: { select: { id: true, truckNumber: true, plateNumber: true } },
          bookings: {
            include: {
              cargoRequest: { include: { trips: true } },
            },
          },
        },
      });
      if (!row || row.driverId !== driverId) {
        const error = new Error("Shared trip not found");
        error.status = 404;
        throw error;
      }
      if (row.status !== "Assigned") {
        const error = new Error("Only Assigned shared trips can be rejected");
        error.status = 400;
        throw error;
      }

      for (const booking of row.bookings) {
        const childTrip = booking.cargoRequest?.trips?.[0];
        if (childTrip && childTrip.status !== "Delivered" && childTrip.status !== "Cancelled") {
          await tx.trip.update({
            where: { id: childTrip.id },
            data: { status: "Cancelled" },
          });
        }
        if (booking.cargoRequestId) {
          await tx.cargoRequest.update({
            where: { id: booking.cargoRequestId },
            data: {
              status: "Pending",
              driverId: null,
              truckId: null,
              assignedByAdminId: null,
              assignedAt: null,
              dispatcherId: null,
            },
          });
        }
        await tx.sharedTripBooking.delete({ where: { id: booking.id } });
      }

      if (row.truckId) {
        await tx.truck.update({
          where: { id: row.truckId },
          data: { status: "Available" },
        });
      }

      const updated = await tx.sharedTrip.update({
        where: { id },
        data: { status: "Cancelled" },
        include: sharedTripInclude,
      });

      const driverName = row.driver?.name || "Darawal";
      const truckLabel =
        row.truck?.truckNumber ||
        row.truck?.plateNumber ||
        row.truckId ||
        "—";
      const adminUsers = await tx.user.findMany({
        where: { role: "admin" },
        select: { id: true },
        take: 20,
      });
      for (const admin of adminUsers) {
        await tx.notification.create({
          data: {
            userId: admin.id,
            type: "shared.rejected",
            message: formatNotifyLines("Darawalku wuu diiday shared loads", {
              tripId: id,
              status: "Cancelled",
              driverName,
              pickup: row.pickup,
              destination: row.destination,
              fromRegion: row.fromRegion,
              fromDistrict: row.fromDistrict,
              toRegion: row.toRegion,
              toDistrict: row.toDistrict,
              body: `Darawal ${driverName} (gaari ${truckLabel}) ayaa diiday — ${row.bookings.length} xamuul ayaa dib ugu noqday Pending.`,
            }),
          },
        });
      }

      return mapSharedTrip(updated);
    });
  },

  /**
   * Driver starts pickup and must enter weight for each assigned load (sent as kg).
   * Payload: { weightsByBookingId: { [bookingId]: kgNumber } }
   */
  async startSharedTripPickup(id, driverId, { weightsByBookingId = {} } = {}) {
    return withTransaction(async (tx) => {
      const row = await tx.sharedTrip.findUnique({
        where: { id },
        include: {
          driver: { select: { id: true, name: true } },
          truck: { select: { truckType: true, plateNumber: true, truckNumber: true } },
          bookings: {
            include: {
              cargoRequest: {
                include: {
                  customer: { select: { id: true, name: true } },
                  trips: { include: { payments: true } },
                },
              },
            },
          },
        },
      });
      if (!row || row.driverId !== driverId) {
        const error = new Error("Shared trip not found");
        error.status = 404;
        throw error;
      }
      if (!["Open for booking", "Full"].includes(row.status)) {
        const error = new Error("Trip must be Open for booking or Full before pickup");
        error.status = 400;
        throw error;
      }
      if (!row.bookings?.length) {
        const error = new Error("Cannot start pickup without customer bookings");
        error.status = 400;
        throw error;
      }

      const weightMap = weightsByBookingId && typeof weightsByBookingId === "object" ? weightsByBookingId : {};
      for (const booking of row.bookings) {
        const kg = Number(weightMap[booking.id]);
        if (!(kg > 0)) {
          const error = new Error(
            `Enter pickup weight for load ${booking.cargoRequestId || booking.id}`
          );
          error.status = 400;
          throw error;
        }
      }

      for (const booking of row.bookings) {
        const kg = Number(weightMap[booking.id]);
        const weightLabel = `${kg} kg`;
        const tons = Math.round((kg / 1000) * 1000) / 1000;
        const request = booking.cargoRequest;
        // Weight only at pickup — final price is set at Delivered from GPS km.
        const updatedRequest = await tx.cargoRequest.update({
          where: { id: request.id },
          data: {
            weight: weightLabel,
            status: "Assigned",
          },
          include: cargoRequestInclude,
        });

        await tx.sharedTripBooking.update({
          where: { id: booking.id },
          data: { weightTons: tons, status: "Confirmed" },
        });

        const shipment = await createBookingTripAndPayment(tx, {
          request: updatedRequest,
          sharedTrip: row,
          bookingId: booking.id,
        });

        if (shipment?.id) {
          await tx.trip.update({
            where: { id: shipment.id },
            data: { status: "En_Route_to_Pickup" },
          });
        }
      }

      const totalBookedTons = row.bookings.reduce((sum, booking) => {
        const kg = Number(weightMap[booking.id]);
        return sum + kg / 1000;
      }, 0);
      const capacity = Number(row.totalCapacityTons) || 0;
      const availableTons = Math.max(0, Math.round((capacity - totalBookedTons) * 100) / 100);

      for (const booking of row.bookings) {
        await tx.sharedTripBooking.update({
          where: { id: booking.id },
          data: { status: "Pickup" },
        });
        if (booking.cargoRequest?.customerId) {
          await tx.notification.create({
            data: {
              userId: booking.cargoRequest.customerId,
              type: "shared.pickup",
              message: formatCustomerNotifyLine(TRIP_NOTIFY.enRoutePickup, {
                bookingId: booking.cargoRequestId,
                tripId: id,
                status: "En Route to Pickup",
                customerName:
                  booking.cargoRequest.customer?.name ||
                  booking.cargoRequest.senderName ||
                  booking.cargoRequest.receiverName ||
                  null,
                driverName: row.driver?.name || null,
                truckType: row.truck?.truckType || null,
                plateNumber: row.truck?.plateNumber || null,
                truckNumber: row.truck?.truckNumber || null,
                pickup: booking.cargoRequest.pickup || row.pickup,
                destination: booking.cargoRequest.destination || row.destination,
                fromRegion: booking.cargoRequest.fromRegion || row.fromRegion,
                fromDistrict: booking.cargoRequest.fromDistrict || row.fromDistrict,
                toRegion: booking.cargoRequest.toRegion || row.toRegion,
                toDistrict: booking.cargoRequest.toDistrict || row.toDistrict,
                extra: "Culeyska / cabbirka waa la diiwaangeliyay.",
              }),
            },
          });
        }
      }

      if (row.truckId) {
        await tx.truck.update({ where: { id: row.truckId }, data: { status: "Busy" } });
      }

      const updated = await tx.sharedTrip.update({
        where: { id },
        data: {
          status: "Pickup",
          availableTons,
        },
        include: sharedTripInclude,
      });
      return mapSharedTrip(updated);
    });
  },

  /**
   * Pickup one load (gathering): enter measured quantity for that booking only
   * (KG / LITER / HEAD — same rules as FTL). Shared trip → Pickup on first load;
   * In Transit only after all loads picked up.
   */
  async pickupSharedBooking(
    sharedTripId,
    bookingId,
    driverId,
    { weightKg, measuredQuantity, measurementUnit, measurements } = {}
  ) {
    await withTransaction(async (tx) => {
      const row = await tx.sharedTrip.findUnique({
        where: { id: sharedTripId },
        include: {
          driver: { select: { id: true, name: true } },
          truck: { select: { truckType: true, plateNumber: true, truckNumber: true } },
          bookings: {
            include: {
              cargoRequest: {
                include: {
                  customer: { select: { id: true, name: true } },
                  trips: { include: { payments: true } },
                },
              },
            },
          },
        },
      });
      if (!row || row.driverId !== driverId) {
        const error = new Error("Shared trip not found");
        error.status = 404;
        throw error;
      }
      if (!["Open for booking", "Full", "Pickup"].includes(row.status)) {
        const error = new Error("Cannot pickup loads in this trip status");
        error.status = 400;
        throw error;
      }

      const booking = (row.bookings || []).find((b) => String(b.id) === String(bookingId));
      if (!booking) {
        const error = new Error("Booking not found on this shared trip");
        error.status = 404;
        throw error;
      }
      if (["Pickup", "In Transit", "Delivered"].includes(booking.status)) {
        const error = new Error("Load-kan waa la qaaday hore");
        error.status = 400;
        throw error;
      }

      const request = booking.cargoRequest;
      if (!request) {
        const error = new Error("Cargo request missing for this booking");
        error.status = 400;
        throw error;
      }

      const cargoType = request.cargoType || "";
      const resolved = resolvePickupMeasurements(
        { measuredQuantity, measurementUnit, measurements, weightKg },
        cargoType
      );
      if (!resolved.ok) {
        const error = new Error(
          resolved.message || "Gali cabbirka (kg / liter / neef) markaad qaadanayso load-kan"
        );
        error.status = 400;
        throw error;
      }

      const weightLabel = resolved.weightLabel;
      const tons =
        resolved.parts.find((p) => p.unit === "KG") != null
          ? Math.round((resolved.parts.find((p) => p.unit === "KG").quantity / 1000) * 1000) / 1000
          : resolved.parts.find((p) => p.unit === "LITER") != null
            ? Math.round((resolved.parts.find((p) => p.unit === "LITER").quantity / 1000) * 1000) / 1000
            : 0;

      const updatedRequest = await tx.cargoRequest.update({
        where: { id: request.id },
        data: {
          weight: weightLabel.slice(0, 120),
          measuredQuantity: resolved.measuredQuantity,
          measurementUnit: resolved.measurementUnit,
          status: "Picked_Up",
        },
        include: cargoRequestInclude,
      });

      const shipment = await createBookingTripAndPayment(tx, {
        request: updatedRequest,
        sharedTrip: row,
        bookingId: booking.id,
      });

      // Must set Pickup AFTER createBookingTripAndPayment (that helper sets Confirmed).
      await tx.sharedTripBooking.update({
        where: { id: booking.id },
        data: { weightTons: tons, status: "Pickup" },
      });

      if (shipment?.id) {
        await tx.trip.update({
          where: { id: shipment.id },
          data: { status: "Picked_Up", distanceTraveledKm: 0, distance: "0 km (GPS)" },
        });
      }

      if (request.customerId) {
        await tx.notification.create({
          data: {
            userId: request.customerId,
            type: "shared.pickup",
            message: formatCustomerNotifyLine(TRIP_NOTIFY.pickedUp, {
              bookingId: booking.cargoRequestId,
              tripId: shipment?.id || sharedTripId,
              status: "Picked Up",
              customerName:
                request.customer?.name || request.senderName || request.receiverName || null,
              driverName: row.driver?.name || null,
              truckType: row.truck?.truckType || null,
              plateNumber: row.truck?.plateNumber || null,
              truckNumber: row.truck?.truckNumber || null,
              pickup: request.pickup || row.pickup,
              destination: request.destination || row.destination,
              fromRegion: request.fromRegion || row.fromRegion,
              fromDistrict: request.fromDistrict || row.fromDistrict,
              toRegion: request.toRegion || row.toRegion,
              toDistrict: request.toDistrict || row.toDistrict,
              extra: `Cabbirka: ${weightLabel}.`,
            }),
          },
        });
      }

      const allBookings = await tx.sharedTripBooking.findMany({ where: { sharedTripId } });
      const totalBookedTons = allBookings.reduce((sum, b) => sum + Number(b.weightTons || 0), 0);
      const capacity = Number(row.totalCapacityTons) || 0;
      const availableTons = Math.max(0, Math.round((capacity - totalBookedTons) * 100) / 100);

      if (row.truckId) {
        await tx.truck.update({ where: { id: row.truckId }, data: { status: "Busy" } });
      }

      await tx.sharedTrip.update({
        where: { id: sharedTripId },
        data: { status: "Pickup", availableTons },
      });
    });

    return this.getSharedTripById(sharedTripId, { includeDriverPhone: true });
  },

  /** After pickup, move shared trip + child trips to In Transit. */
  async markSharedTripInTransit(id, driverId) {
    return withTransaction(async (tx) => {
      const row = await tx.sharedTrip.findUnique({
        where: { id },
        include: {
          bookings: {
            include: {
              cargoRequest: {
                include: {
                  trips: { include: { payments: true } },
                },
              },
            },
          },
        },
      });
      if (!row || row.driverId !== driverId) {
        const error = new Error("Shared trip not found");
        error.status = 404;
        throw error;
      }
      if (!["Pickup", "Departed"].includes(row.status)) {
        const error = new Error("Trip must be in Pickup before marking In Transit");
        error.status = 400;
        throw error;
      }

      const pendingPickup = (row.bookings || []).filter(
        (b) => !["Pickup", "In Transit", "Delivered"].includes(b.status)
      );
      if (pendingPickup.length) {
        const error = new Error(
          `Weli ${pendingPickup.length} load(s) lama qaadin — Pickup mid mid ka dib In Transit.`
        );
        error.status = 400;
        throw error;
      }

      for (const booking of row.bookings || []) {
        const childTrip = booking.cargoRequest?.trips?.[0];
        if (childTrip) {
          await tx.trip.update({ where: { id: childTrip.id }, data: { status: "In_Transit" } });
        }
        await tx.sharedTripBooking.update({
          where: { id: booking.id },
          data: { status: "In Transit" },
        });
      }

      const updated = await tx.sharedTrip.update({
        where: { id },
        data: { status: "In Transit" },
        include: sharedTripInclude,
      });
      return mapSharedTrip(updated);
    });
  },

  async markSharedTripDelivered(id, driverId) {
    return withTransaction(async (tx) => {
      const row = await tx.sharedTrip.findUnique({
        where: { id },
        include: {
          bookings: {
            include: { cargoRequest: { include: { trips: true } } },
          },
        },
      });
      if (!row || row.driverId !== driverId) {
        const error = new Error("Shared trip not found");
        error.status = 404;
        throw error;
      }
      if (!["In Transit", "Departed"].includes(row.status)) {
        const error = new Error("Trip must be In Transit before marking Delivered");
        error.status = 400;
        throw error;
      }

      for (const booking of row.bookings || []) {
        const trip = booking.cargoRequest?.trips?.[0];
        if (trip && trip.status !== "Delivered") {
          await tx.trip.update({ where: { id: trip.id }, data: { status: "Delivered" } });
        }
        if (booking.cargoRequestId) {
          await tx.cargoRequest.update({
            where: { id: booking.cargoRequestId },
            data: { status: "Delivered" },
          });
        }
        await tx.sharedTripBooking.update({
          where: { id: booking.id },
          data: { status: "Delivered" },
        });
      }

      if (row.truckId) {
        await tx.truck.update({ where: { id: row.truckId }, data: { status: "Available" } });
      }

      const updated = await tx.sharedTrip.update({
        where: { id },
        data: { status: "Delivered" },
        include: sharedTripInclude,
      });
      return mapSharedTrip(updated);
    });
  },

  /** @deprecated Prefer startSharedTripPickup / markSharedTripInTransit / markSharedTripDelivered */
  async advanceSharedTripStatus(id, driverId, nextStatus) {
    if (nextStatus === "Departed" || nextStatus === "Pickup") {
      return this.startSharedTripPickup(id, driverId);
    }
    if (nextStatus === "In Transit") {
      return this.markSharedTripInTransit(id, driverId);
    }
    if (nextStatus === "Completed" || nextStatus === "Delivered") {
      return this.markSharedTripDelivered(id, driverId);
    }
    const error = new Error("Invalid shared trip status");
    error.status = 400;
    throw error;
  },

  async bookSharedCapacity({ sharedTripId, customerId, customerName, weightTons, description, customerRole, ...locationFields }) {
    return withTransaction(async (tx) => {
      const trip = await tx.sharedTrip.findUnique({
        where: { id: sharedTripId },
        include: {
          driver: { select: { id: true, name: true } },
          truck: {
            select: { id: true, truckType: true, plateNumber: true, truckNumber: true },
          },
        },
      });
      if (!trip || trip.status !== "Open for booking") {
        const error = new Error("Shared trip is not open for booking");
        error.status = 400;
        throw error;
      }
      const tons = Number(weightTons);
      if (!Number.isFinite(tons) || tons <= 0) {
        const error = new Error("Weight must be positive");
        error.status = 400;
        throw error;
      }
      if (tons > Number(trip.availableTons)) {
        const error = new Error(`Only ${trip.availableTons} tons available on this trip`);
        error.status = 400;
        throw error;
      }

      const bookingCorridor = sharedCorridorKey({
        fromRegion: locationFields.fromRegion || trip.fromRegion,
        fromDistrict: locationFields.fromDistrict || trip.fromDistrict,
        toRegion: locationFields.toRegion || trip.toRegion,
        toDistrict: locationFields.toDistrict || trip.toDistrict,
        pickup: locationFields.pickup || trip.pickup,
        destination: locationFields.destination || trip.destination,
      });
      const tripCorridor = sharedCorridorKey(trip);
      if (tripCorridor && bookingCorridor && bookingCorridor !== tripCorridor) {
        const error = new Error(
          "This load is on a different corridor. Shared bookings must match the trip gobol + magalo (pickup and delivery)."
        );
        error.status = 400;
        throw error;
      }

      const pricePerTon = trip.pricePerTon != null ? Number(trip.pricePerTon) : null;
      if (pricePerTon == null || !Number.isFinite(pricePerTon) || pricePerTon <= 0) {
        const error = new Error("This shared trip has no price per ton set by the driver");
        error.status = 400;
        throw error;
      }
      const sharedPrice = pricePerTon * tons;

      const requestId = `REQ-${Math.floor(9000 + Math.random() * 1000)}`;
      const request = await tx.cargoRequest.create({
        data: {
          id: requestId,
          customerId,
          driverId: trip.driverId,
          truckId: trip.truckId,
          loadType: "SHARED",
          pickup: locationFields.pickup || trip.pickup,
          destination: locationFields.destination || trip.destination,
          truckType: trip.truck?.truckType || "Shared",
          weight: `${tons} tons`,
          description: description || `Shared load booking on ${sharedTripId}`,
          customerRole: customerRole || null,
          senderName: locationFields.senderName || null,
          senderPhone: locationFields.senderPhone || null,
          receiverName: locationFields.receiverName || null,
          receiverPhone: locationFields.receiverPhone || null,
          fromRegion: locationFields.fromRegion || trip.fromRegion,
          fromDistrict: locationFields.fromDistrict || trip.fromDistrict,
          fromNeighborhood: locationFields.fromNeighborhood || null,
          toRegion: locationFields.toRegion || trip.toRegion,
          toDistrict: locationFields.toDistrict || trip.toDistrict,
          toNeighborhood: locationFields.toNeighborhood || null,
          finalPrice: sharedPrice,
          quotedPrice: sharedPrice,
          status: "Assigned",
        },
        include: cargoRequestInclude,
      });

      const booking = await tx.sharedTripBooking.create({
        data: {
          sharedTripId,
          customerId,
          cargoRequestId: requestId,
          weightTons: tons,
          status: "Confirmed",
        },
      });

      const shipment = await createBookingTripAndPayment(tx, {
        request,
        sharedTrip: trip,
        bookingId: booking.id,
      });

      const nextAvailable = Number(trip.availableTons) - tons;
      await tx.sharedTrip.update({
        where: { id: sharedTripId },
        data: {
          availableTons: nextAvailable,
          status: nextAvailable <= 0 ? "Full" : "Open for booking",
        },
      });

      await tx.notification.create({
        data: {
          userId: trip.driverId,
          type: "shared.booking",
          message: formatNotifyLines("Shared booking cusub", {
            bookingId: requestId,
            tripId: shipment?.id,
            customerName: customerName || null,
            driverName: trip.driver?.name || null,
            truckType: trip.truck?.truckType || null,
            plateNumber: trip.truck?.plateNumber || null,
            truckNumber: trip.truck?.truckNumber || null,
            pickup: request.pickup || trip.pickup,
            destination: request.destination || trip.destination,
            fromRegion: request.fromRegion || trip.fromRegion,
            fromDistrict: request.fromDistrict || trip.fromDistrict,
            toRegion: request.toRegion || trip.toRegion,
            toDistrict: request.toDistrict || trip.toDistrict,
            body: `${tons}t ayaa lagu buuxiyay ${sharedTripId}.`,
          }),
        },
      });

      await tx.notification.create({
        data: {
          userId: customerId,
          type: "shared.assigned",
          message: formatCustomerNotifyLine(TRIP_NOTIFY.assigned, {
            bookingId: requestId,
            tripId: shipment?.id,
            status: "Assigned",
            customerName: customerName || null,
            driverName: trip.driver?.name || null,
            truckType: trip.truck?.truckType || null,
            plateNumber: trip.truck?.plateNumber || null,
            truckNumber: trip.truck?.truckNumber || null,
            pickup: request.pickup || trip.pickup,
            destination: request.destination || trip.destination,
            fromRegion: request.fromRegion || trip.fromRegion,
            fromDistrict: request.fromDistrict || trip.fromDistrict,
            toRegion: request.toRegion || trip.toRegion,
            toDistrict: request.toDistrict || trip.toDistrict,
            extra: "Lacagta 100% waxaa la bixiyaa Delivered ka dib.",
          }),
        },
      });

      return {
        ...mapCargoRequest(request),
        tripId: shipment?.id || null,
        depositRequired: false,
        depositPercent: 0,
        fullPaymentOnce: false,
        payAfterDelivery: true,
      };
    });
  },

  /**
   * Admin: pool existing SHARED cargo requests onto one SHARED truck.
   * Creates one SharedTrip + bookings so the driver can gather → pickup → deliver.
   */
  async assignSharedLoadsToTruck({
    cargoRequestIds = [],
    truckId,
    driverId,
    dispatcherId,
    fare,
    estimatedTime,
  } = {}) {
    const ids = [...new Set((cargoRequestIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
    if (!ids.length) {
      const error = new Error("Select at least one shared cargo request");
      error.status = 400;
      throw error;
    }
    if (ids.length < 2) {
      const error = new Error("Shared pool needs at least 2 loads on the same corridor");
      error.status = 400;
      throw error;
    }
    if (!truckId || !driverId) {
      const error = new Error("truckId and driverId are required");
      error.status = 400;
      throw error;
    }

    return withTransaction(async (tx) => {
      const truck = await tx.truck.findFirst({
        where: { id: truckId, driverId },
        include: {
          driver: {
            select: { id: true, role: true, status: true, serviceType: true, name: true },
          },
        },
      });
      if (!truck?.driver || truck.driver.role !== "driver") {
        const error = new Error("Truck must belong to the selected driver");
        error.status = 400;
        throw error;
      }
      if (truck.driver.serviceType !== "SHARED") {
        const error = new Error("Assign shared loads only to a SHARED driver/truck");
        error.status = 400;
        throw error;
      }
      if (truck.driver.status !== "Active") {
        const error = new Error("This driver is not available (inactive)");
        error.status = 400;
        throw error;
      }
      if (String(truck.status) !== "Available") {
        const error = new Error(
          `This truck is ${String(truck.status).replaceAll("_", " ")}. Choose an available SHARED truck.`
        );
        error.status = 400;
        throw error;
      }

      const capacityTons = resolveTruckCapacityTons(truck);
      if (!(capacityTons > 0)) {
        const error = new Error("Selected truck has no registered capacity (tons)");
        error.status = 400;
        throw error;
      }

      const activeShared = await tx.sharedTrip.count({
        where: {
          driverId,
          status: { in: ACTIVE_SHARED_STATUSES },
        },
      });
      if (activeShared > 0) {
        const error = new Error("This SHARED driver already has an active shared trip");
        error.status = 400;
        throw error;
      }

      const requests = await tx.cargoRequest.findMany({
        where: { id: { in: ids } },
        include: { customer: { select: { id: true, name: true } } },
      });
      if (requests.length !== ids.length) {
        const error = new Error("One or more cargo requests were not found");
        error.status = 404;
        throw error;
      }

      const assignableStatuses = new Set([
        "Pending",
        "Awaiting Approval",
        "Quote Rejected",
        "Approved",
      ]);
      for (const request of requests) {
        if (request.loadType !== "SHARED") {
          const error = new Error(`Request ${request.id} is not a SHARED load`);
          error.status = 400;
          throw error;
        }
        if (request.driverId || request.truckId) {
          const error = new Error(`Request ${request.id} is already assigned`);
          error.status = 400;
          throw error;
        }
        const statusApi = reqStatusToApi(request.status);
        if (!assignableStatuses.has(statusApi)) {
          const error = new Error(`Request ${request.id} cannot be assigned (status ${statusApi})`);
          error.status = 400;
          throw error;
        }
      }

      assertSharedLoadsSameCorridor(requests);

      const requestTons = [];
      for (const request of requests) {
        // Weight TBD until pickup; price TBD until Delivered (GPS km).
        requestTons.push({
          request,
          tons: 0,
          fare: null,
          weightLabel: "TBD",
        });
      }
      const totalTons = requestTons.reduce((sum, row) => sum + row.tons, 0);
      if (totalTons > capacityTons + 0.001) {
        const error = new Error(
          `Selected loads are ${totalTons.toFixed(2)}t but truck capacity is ${capacityTons}t`
        );
        error.status = 400;
        throw error;
      }

      const primary = requests[0];
      const departureDate = parseDepartureDate(new Date().toISOString().slice(0, 10));
      const sharedTripId = `ST-${Date.now().toString(36).toUpperCase()}`;
      const sharedTrip = await tx.sharedTrip.create({
        data: {
          id: sharedTripId,
          driverId,
          truckId: truck.id,
          pickup: primary.pickup,
          destination: primary.destination,
          fromRegion: primary.fromRegion || null,
          fromDistrict: primary.fromDistrict || null,
          toRegion: primary.toRegion || null,
          toDistrict: primary.toDistrict || null,
          departureDate,
          durationAmount: 1,
          durationUnit: "days",
          totalCapacityTons: capacityTons,
          availableTons: capacityTons,
          pricePerTon: null,
          notes: `Admin pool assign (${ids.length} loads)`,
          status: "Assigned",
        },
      });

      let availableTons = capacityTons;
      const booked = [];

      for (let stopIndex = 0; stopIndex < requestTons.length; stopIndex += 1) {
        const { request, tons, weightLabel } = requestTons[stopIndex];
        const stopNum = stopIndex + 1;
        const tripEta =
          (estimatedTime != null && String(estimatedTime).trim()) ||
          request.quotedEstimatedTime ||
          null;

        const updatedRequest = await tx.cargoRequest.update({
          where: { id: request.id },
          data: {
            status: "Assigned",
            driverId,
            truckId: truck.id,
            dispatcherId: dispatcherId || null,
            assignedByAdminId: dispatcherId || null,
            assignedAt: new Date(),
            weight: weightLabel || request.weight,
            ...(tripEta ? { quotedEstimatedTime: tripEta } : {}),
          },
          include: cargoRequestInclude,
        });

        const booking = await tx.sharedTripBooking.create({
          data: {
            sharedTripId: sharedTrip.id,
            customerId: request.customerId,
            cargoRequestId: request.id,
            weightTons: tons,
            status: "Confirmed",
            pickupOrder: stopNum,
            deliveryOrder: stopNum,
          },
        });

        let shipment = await createBookingTripAndPayment(tx, {
          request: updatedRequest,
          sharedTrip: { ...sharedTrip, driverId, truckId: truck.id },
          bookingId: booking.id,
        });

        if (shipment?.id && dispatcherId) {
          await tx.trip.update({
            where: { id: shipment.id },
            data: {
              dispatcherId,
              ...(tripEta ? { estimatedTime: tripEta } : {}),
            },
          }).catch(() => null);
        }

        availableTons = Math.max(0, Math.round((availableTons - tons) * 100) / 100);

        await tx.notification.create({
          data: {
            userId: request.customerId,
            type: "booking.assigned",
            message: formatCustomerNotifyLine(TRIP_NOTIFY.assigned, {
              bookingId: request.id,
              tripId: shipment?.id,
              status: "Assigned",
              customerName:
                request.customer?.name ||
                request.senderName ||
                request.receiverName ||
                null,
              driverName: truck.driver?.name || null,
              truckType: truck.truckType || null,
              plateNumber: truck.plateNumber || null,
              truckNumber: truck.truckNumber || null,
              pickup: request.pickup || sharedTrip.pickup,
              destination: request.destination || sharedTrip.destination,
              fromRegion: request.fromRegion || sharedTrip.fromRegion,
              fromDistrict: request.fromDistrict || sharedTrip.fromDistrict,
              toRegion: request.toRegion || sharedTrip.toRegion,
              toDistrict: request.toDistrict || sharedTrip.toDistrict,
            }),
          },
        });

        booked.push({
          cargoRequestId: request.id,
          bookingId: booking.id,
          tripId: shipment?.id || null,
          tons,
          fare: null,
        });
      }

      // Wait for one driver Accept/Reject for the whole pool (same corridor).
      const updatedShared = await tx.sharedTrip.update({
        where: { id: sharedTrip.id },
        data: {
          availableTons,
          status: "Assigned",
        },
        include: sharedTripInclude,
      });

      await tx.truck.update({
        where: { id: truck.id },
        data: { status: "Busy" },
      });

      await tx.notification.create({
        data: {
          userId: driverId,
          type: "shared.assigned",
          message: formatNotifyLines("Shared loads — Accept ama Reject", {
            tripId: sharedTripId,
            status: "Assigned",
            driverName: truck.driver?.name || null,
            pickup: sharedTrip.pickup,
            destination: sharedTrip.destination,
            fromRegion: sharedTrip.fromRegion,
            fromDistrict: sharedTrip.fromDistrict,
            toRegion: sharedTrip.toRegion,
            toDistrict: sharedTrip.toDistrict,
            body: `${booked.length} xamuul oo jid isku mid ah — aqbal ama diid shaqada oo dhan.`,
          }),
        },
      });

      if (dispatcherId) {
        await tx.auditLog.create({
          data: auditFields({
            userId: dispatcherId,
            action: "shared.pool.assigned",
            entityType: "shared_trips",
            entityId: sharedTripId,
            description: `Admin assigned ${booked.length} SHARED request(s) to ${sharedTripId}`,
            newValues: {
              truckId: truck.id,
              driverId,
              cargoRequestIds: ids,
              totalTons,
              capacityTons,
            },
          }),
        });
      }

      return {
        sharedTrip: mapSharedTrip(updatedShared, { includeDriverPhone: true }),
        bookings: booked,
        totalTons,
        capacityTons,
      };
    });
  },

  /** Driver reorders pickup / delivery stop sequence. */
  async reorderSharedTripStops(id, driverId, { pickupOrder = [], deliveryOrder = [] } = {}) {
    const row = await prisma.sharedTrip.findUnique({
      where: { id },
      include: { bookings: true },
    });
    if (!row || row.driverId !== driverId) {
      const error = new Error("Shared trip not found");
      error.status = 404;
      throw error;
    }
    if (["Delivered", "Completed", "Cancelled"].includes(row.status)) {
      const error = new Error("Cannot reorder stops on a finished trip");
      error.status = 400;
      throw error;
    }
    const bookingIds = new Set(row.bookings.map((b) => b.id));
    for (const list of [pickupOrder, deliveryOrder]) {
      for (const bid of list) {
        if (!bookingIds.has(String(bid))) {
          const error = new Error("Invalid booking in stop order");
          error.status = 400;
          throw error;
        }
      }
    }

    await withTransaction(async (tx) => {
      for (let i = 0; i < pickupOrder.length; i += 1) {
        await tx.sharedTripBooking.update({
          where: { id: pickupOrder[i] },
          data: { pickupOrder: i + 1 },
        });
      }
      for (let i = 0; i < deliveryOrder.length; i += 1) {
        await tx.sharedTripBooking.update({
          where: { id: deliveryOrder[i] },
          data: { deliveryOrder: i + 1 },
        });
      }
    });

    return this.getSharedTripById(id, { includeDriverPhone: true });
  },

  /** Mark one shared load as Delivered (per customer). Completes trip when all loads delivered. */
  async markSharedBookingDelivered(sharedTripId, bookingId, driverId, { deliveryConfirmCode: confirmCodeInput } = {}) {
    return withTransaction(async (tx) => {
      const row = await tx.sharedTrip.findUnique({
        where: { id: sharedTripId },
        include: {
          driver: { select: { id: true, name: true } },
          truck: { select: { truckType: true, plateNumber: true, truckNumber: true } },
          bookings: {
            include: {
              cargoRequest: {
                include: {
                  customer: { select: { id: true, name: true } },
                  trips: true,
                },
              },
            },
          },
        },
      });
      if (!row || row.driverId !== driverId) {
        const error = new Error("Shared trip not found");
        error.status = 404;
        throw error;
      }
      if (!["In Transit", "Departed", "Pickup"].includes(row.status)) {
        const error = new Error("Trip must be In Transit before delivering loads");
        error.status = 400;
        throw error;
      }

      const booking = row.bookings.find((b) => b.id === bookingId);
      if (!booking) {
        const error = new Error("Booking not found on this shared trip");
        error.status = 404;
        throw error;
      }
      if (booking.status === "Delivered") {
        const error = new Error("This load is already delivered");
        error.status = 400;
        throw error;
      }

      const childTrip = booking.cargoRequest?.trips?.[0];
      const codeTripId = childTrip?.id || booking.cargoRequestId || booking.id;
      const expected = deliveryConfirmCode(codeTripId);
      const provided = String(confirmCodeInput || "").trim();
      if (!provided) {
        const error = new Error("Gali koodhka xaqiijinta ee macmiilka (6 digits)");
        error.status = 400;
        throw error;
      }
      if (provided !== expected) {
        const error = new Error("Koodhka xaqiijinta waa khaldan. Weydii macmiilka koodhka saxda ah.");
        error.status = 400;
        throw error;
      }

      if (childTrip && childTrip.status !== "Delivered") {
        let finalFare = Number(childTrip.fare || 0);
        const traveledKm = Number(childTrip.distanceTraveledKm || 0);
        const cargo = booking.cargoRequest;
        if (cargo) {
          const gpsFare = await fareFromTraveledKm(
            cargo.weight || "1 kg",
            cargo.loadType || "SHARED",
            traveledKm
          );
          if (gpsFare != null) {
            finalFare = gpsFare;
            const kmLabel = `${Math.round(traveledKm * 10) / 10} km (GPS)`;
            await tx.trip.update({
              where: { id: childTrip.id },
              data: {
                status: "Delivered",
                fare: finalFare,
                distance: kmLabel,
                distanceTraveledKm: Math.round(traveledKm * 100) / 100,
              },
            });
            await tx.cargoRequest.update({
              where: { id: cargo.id },
              data: {
                status: "Delivered",
                finalPrice: finalFare,
                quotedPrice: finalFare,
                calculatedPrice: finalFare,
                distanceKm: Math.round(traveledKm * 100) / 100,
              },
            });
          } else {
            await tx.trip.update({
              where: { id: childTrip.id },
              data: { status: "Delivered" },
            });
            await tx.cargoRequest.update({
              where: { id: cargo.id },
              data: { status: "Delivered" },
            });
          }
        } else {
          await tx.trip.update({
            where: { id: childTrip.id },
            data: { status: "Delivered" },
          });
        }

        if (finalFare > 0 && booking.cargoRequest?.customerId) {
          const existingPayment = await tx.payment.findFirst({
            where: { tripId: childTrip.id },
            orderBy: { createdAt: "desc" },
          });
          if (!existingPayment) {
            await tx.payment.create({
              data: {
                tripId: childTrip.id,
                customerId: booking.cargoRequest.customerId,
                amount: finalFare,
                amountPaid: 0,
                status: "Pending",
                method: "waafipay",
                provider: "waafipay",
                currency: process.env.WAAFI_CURRENCY || "SLSH",
                referenceId: buildWaafiReferenceId(childTrip.id),
                description: `Shared trip ${sharedTripId} / ${childTrip.id} — pay 100% after delivery`,
              },
            });
          } else if (Number(existingPayment.amountPaid || 0) <= 0) {
            await tx.payment.update({
              where: { id: existingPayment.id },
              data: { amount: finalFare },
            });
          }
        }
      } else if (booking.cargoRequestId) {
        await tx.cargoRequest.update({
          where: { id: booking.cargoRequestId },
          data: { status: "Delivered" },
        });
      }

      await tx.sharedTripBooking.update({
        where: { id: booking.id },
        data: { status: "Delivered" },
      });

      if (booking.cargoRequest?.customerId) {
        await tx.notification.create({
          data: {
            userId: booking.cargoRequest.customerId,
            type: "trip.delivered",
            message: formatCustomerNotifyLine(TRIP_NOTIFY.delivered, {
              bookingId: booking.cargoRequestId,
              tripId: childTrip?.id || sharedTripId,
              status: "Delivered",
              customerName:
                booking.cargoRequest.customer?.name ||
                booking.cargoRequest.senderName ||
                booking.cargoRequest.receiverName ||
                null,
              driverName: row.driver?.name || null,
              truckType: row.truck?.truckType || null,
              plateNumber: row.truck?.plateNumber || null,
              truckNumber: row.truck?.truckNumber || null,
              pickup: booking.cargoRequest.pickup || row.pickup,
              destination: booking.cargoRequest.destination || row.destination,
              fromRegion: booking.cargoRequest.fromRegion || row.fromRegion,
              fromDistrict: booking.cargoRequest.fromDistrict || row.fromDistrict,
              toRegion: booking.cargoRequest.toRegion || row.toRegion,
              toDistrict: booking.cargoRequest.toDistrict || row.toDistrict,
            }),
          },
        });
      }

      const pending = row.bookings.filter(
        (b) => b.id !== booking.id && b.status !== "Delivered"
      );
      if (!pending.length) {
        if (row.truckId) {
          await tx.truck.update({ where: { id: row.truckId }, data: { status: "Available" } });
        }
        await tx.sharedTrip.update({
          where: { id: sharedTripId },
          data: { status: "Delivered" },
        });
      }

      const updated = await tx.sharedTrip.findUnique({
        where: { id: sharedTripId },
        include: sharedTripInclude,
      });
      return mapSharedTrip(updated);
    });
  },
};
