import { prisma, withTransaction } from "../../lib/prisma.js";
import { mapCargoRequest, cargoRequestInclude } from "./mappers.js";
import { estimateDistanceKm, estimateEtaLabel } from "../pricingService.js";
import { buildWaafiReferenceId } from "../waafiPayService.js";
import { hasStartPaymentPaid } from "../../lib/paymentWorkflow.js";

/** Capacity always comes from the registered truck — never from free-form input. */
function resolveTruckCapacityTons(truck) {
  if (!truck) return 0;
  const tons = Number(truck.capacityTons);
  if (Number.isFinite(tons) && tons > 0) return tons;
  const fromLabel = Number(String(truck.capacity || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(fromLabel) && fromLabel > 0 ? fromLabel : 0;
}

/** Statuses that block publishing another shared trip. */
const ACTIVE_SHARED_STATUSES = ["Open for booking", "Full", "Pickup", "In Transit", "Departed"];

const TERMINAL_SHARED_STATUSES = ["Delivered", "Completed", "Cancelled"];

function parseDepartureDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapSharedTrip(row) {
  if (!row) return null;
  return {
    id: row.id,
    driverId: row.driverId,
    driver: row.driver?.name || null,
    driverPhone: row.driver?.phone || null,
    truckId: row.truckId,
    truck: row.truck?.truckNumber || null,
    truckType: row.truck?.truckType || null,
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

/** Create shipment + full invoice when a customer books (pay once before pickup). */
async function createBookingTripAndPayment(tx, { request, sharedTrip, bookingId = null }) {
  if (!request) return null;

  const fare =
    request.finalPrice != null
      ? Number(request.finalPrice)
      : request.quotedPrice != null
        ? Number(request.quotedPrice)
        : 0;
  if (!(fare > 0)) {
    const error = new Error(`Booking ${request.id} has no fare for payment`);
    error.status = 400;
    throw error;
  }

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
        fare,
      },
    });
  }

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
        description: `Shared trip ${sharedTrip.id} / ${trip.id} — pay full amount once before pickup`,
      },
    });
  }

  if (request.status !== "Assigned") {
    await tx.cargoRequest.update({
      where: { id: request.id },
      data: { status: "Assigned", finalPrice: fare },
    });
  }

  if (bookingId) {
    await tx.sharedTripBooking.update({
      where: { id: bookingId },
      data: { status: "Awaiting deposit" },
    });
  }

  return trip;
}

async function listUnpaidBookingIds(bookings = []) {
  const unpaid = [];
  for (const booking of bookings) {
    const trip = booking.cargoRequest?.trips?.[0];
    const payment = trip?.payments?.[0];
    const fare = Number(payment?.amount ?? trip?.fare ?? booking.cargoRequest?.finalPrice ?? 0);
    if (
      !hasStartPaymentPaid({
        amount: fare,
        amountPaid: payment?.amountPaid ?? 0,
        fullPaymentOnce: true,
      })
    ) {
      unpaid.push(booking.cargoRequestId || booking.id);
    }
  }
  return unpaid;
}

export const sharedTripRepository = {
  async sharedTripsSummary({ driverId } = {}) {
    const where = driverId ? { driverId } : {};
    const [total, open, full, pickup, inTransit, delivered] = await Promise.all([
      prisma.sharedTrip.count({ where }),
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

  async listSharedTrips({ driverId, status, search, page = 1, limit = 50, publicOnly = false } = {}) {
    const where = {};
    if (driverId) where.driverId = driverId;
    if (status) where.status = status;
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
    return { data: data.map(mapSharedTrip), total, page: Number(page) };
  },

  async getSharedTripById(id) {
    const row = await prisma.sharedTrip.findUnique({
      where: { id },
      include: {
        ...sharedTripInclude,
        bookings: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            cargoRequest: { include: cargoRequestInclude },
          },
        },
      },
    });
    if (!row) return null;
    return {
      ...mapSharedTrip(row),
      bookings: (row.bookings || []).map((b) => ({
        id: b.id,
        customerId: b.customerId,
        customer: b.customer?.name || null,
        customerPhone: b.customer?.phone || null,
        weightTons: Number(b.weightTons),
        status: b.status,
        cargoRequestId: b.cargoRequestId,
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
   * Driver starts pickup only after every customer paid the full shared fare once.
   * Legacy bookings without invoices get invoices created, but pickup still waits for payment.
   */
  async startSharedTripPickup(id, driverId) {
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

      for (const booking of row.bookings) {
        await createBookingTripAndPayment(tx, {
          request: booking.cargoRequest,
          sharedTrip: row,
          bookingId: booking.id,
        });
      }

      // Re-load payments after ensuring invoices exist
      const fresh = await tx.sharedTrip.findUnique({
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

      const unpaid = await listUnpaidBookingIds(fresh?.bookings || []);
      if (unpaid.length) {
        const error = new Error(
          `Lacagta oo dhan waa in la bixiyaa ka hor pickup. Waiting on: ${unpaid.join(", ")}`
        );
        error.status = 400;
        throw error;
      }

      for (const booking of fresh.bookings || []) {
        const childTrip = booking.cargoRequest?.trips?.[0];
        if (childTrip && childTrip.status === "Assigned") {
          await tx.trip.update({ where: { id: childTrip.id }, data: { status: "Accepted" } });
        }
        await tx.sharedTripBooking.update({
          where: { id: booking.id },
          data: { status: "Pickup" },
        });
        if (booking.cargoRequest?.customerId) {
          await tx.notification.create({
            data: {
              userId: booking.cargoRequest.customerId,
              type: "shared.pickup",
              message: `Driver started pickup for shared trip ${id}.`,
            },
          });
        }
      }

      if (row.truckId) {
        await tx.truck.update({ where: { id: row.truckId }, data: { status: "Busy" } });
      }

      const updated = await tx.sharedTrip.update({
        where: { id },
        data: { status: "Pickup" },
        include: sharedTripInclude,
      });
      return mapSharedTrip(updated);
    });
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
        include: { driver: { include: { truck: true } } },
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

      const pricePerTon = trip.pricePerTon != null ? Number(trip.pricePerTon) : null;
      if (pricePerTon == null || !Number.isFinite(pricePerTon) || pricePerTon <= 0) {
        const error = new Error("This shared trip has no price per ton set by the driver");
        error.status = 400;
        throw error;
      }
      const sharedPrice = pricePerTon * tons;
      const distanceKm = estimateDistanceKm(trip.pickup, trip.destination, {
        fromRegion: trip.fromRegion,
        fromDistrict: trip.fromDistrict,
        toRegion: trip.toRegion,
        toDistrict: trip.toDistrict,
      });

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
          truckType: trip.driver.truck?.truckType || "Shared",
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
          distanceKm,
          quotedEstimatedTime: estimateEtaLabel(distanceKm),
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
          status: "Awaiting deposit",
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
          message: `${customerName || "Customer"} booked ${tons}t on ${sharedTripId}`,
        },
      });

      await tx.notification.create({
        data: {
          userId: customerId,
          type: "shared.deposit_due",
          message: `Pay the full fare for ${shipment?.id || requestId} once before the driver can start pickup.`,
        },
      });

      return {
        ...mapCargoRequest(request),
        tripId: shipment?.id || null,
        depositRequired: true,
        depositPercent: 100,
        fullPaymentOnce: true,
      };
    });
  },
};
