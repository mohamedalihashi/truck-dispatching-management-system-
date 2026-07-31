import { prisma, withTransaction } from "../../lib/prisma.js";
import { mapCargoRequest, cargoRequestInclude } from "./mappers.js";

const ACTIVE_TRIP_STATUSES = ["Assigned", "Accepted", "Arrived_Pickup", "Loaded", "In_Transit", "Delayed"];

const phoneStatus = (row) => {
  const apiStatus = String(row.status || "").replace(/_/g, " ");
  let status;
  if (row.status === "Pending" && !row.driverId) status = "NOT_ASSIGNED";
  else if (row.status === "Pending" && row.driverId) status = "AWAITING_QUOTE";
  else if (apiStatus === "Awaiting Approval" || row.status === "Awaiting_Approval") status = "AWAITING_CUSTOMER";
  else if (apiStatus === "Quote Rejected" || row.status === "Quote_Rejected") status = "QUOTE_REJECTED";
  else status = String(row.status).replace(/_/g, " ").toUpperCase().replace(/ /g, "_");

  return {
    ...mapCargoRequest(row),
    status,
    quotedPrice: row.quotedPrice != null ? Number(row.quotedPrice) : null,
    finalPrice: row.finalPrice != null ? Number(row.finalPrice) : null,
    quotedEstimatedTime: row.quotedEstimatedTime || null,
  };
};

export const phoneBookingRepository = {
  async availablePhoneOptions() {
    const driverRules = {
      role: "driver",
      status: "Active",
      tripsAsDriver: { none: { status: { in: ACTIVE_TRIP_STATUSES } } },
    };
    const [trucks, sharedTrips] = await Promise.all([
      prisma.truck.findMany({
        where: {
          status: "Available",
          driver: { ...driverRules, OR: [{ serviceType: "FTL" }, { serviceType: null }] },
        },
        include: { driver: { select: { id: true, name: true, phone: true, lastSeenAt: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.sharedTrip.findMany({
        where: {
          status: "Open for booking",
          availableTons: { gt: 0 },
          driver: { role: "driver", status: "Active" },
          truck: { status: { in: ["Available", "Busy"] } },
        },
        include: {
          driver: { select: { id: true, name: true, phone: true, lastSeenAt: true } },
          truck: true,
        },
        orderBy: { departureDate: "asc" },
      }),
    ]);
    return {
      ftl: trucks.map((truck) => ({
        id: truck.id,
        truckId: truck.id,
        loadType: "FTL",
        driver: truck.driver.name,
        driverPhone: truck.driver.phone,
        online: Boolean(truck.driver.lastSeenAt),
        truckNumber: truck.truckNumber,
        plateNumber: truck.plateNumber,
        truckType: truck.truckType,
        capacity: truck.capacity,
      })),
      shared: sharedTrips.map((trip) => ({
        id: trip.id,
        sharedTripId: trip.id,
        loadType: "SHARED",
        driver: trip.driver.name,
        driverPhone: trip.driver.phone,
        online: Boolean(trip.driver.lastSeenAt),
        truckNumber: trip.truck.truckNumber,
        plateNumber: trip.truck.plateNumber,
        truckType: trip.truck.truckType,
        route: `${trip.pickup} → ${trip.destination}`,
        availableTons: Number(trip.availableTons),
      })),
    };
  },

  async createPhoneBooking(payload, adminId) {
    const customer = await prisma.user.findFirst({
      where: { id: payload.customerId, role: "customer", status: "Active" },
      select: { id: true },
    });
    if (!customer) {
      const error = new Error("Select a valid active customer");
      error.status = 400;
      throw error;
    }

    const id = `REQ-${Math.floor(9000 + Math.random() * 1000)}`;
    const row = await prisma.cargoRequest.create({
      data: {
        id,
        customerId: payload.customerId,
        loadType: payload.loadType,
        bookingChannel: "PHONE_ASSISTED",
        pickup: payload.pickup,
        destination: payload.destination,
        truckType: payload.truckType || (payload.loadType === "SHARED" ? "Shared" : "General"),
        weight: payload.weight,
        description: payload.description,
        senderName: payload.pickupContactName,
        senderPhone: payload.pickupContactPhone,
        receiverName: payload.destinationContactName,
        receiverPhone: payload.destinationContactPhone,
        fromNeighborhood: payload.pickup,
        toNeighborhood: payload.destination,
        cargoImageUrl: payload.cargoImageUrl || null,
        status: "Pending",
      },
      include: cargoRequestInclude,
    });
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "phone_booking.created",
        entityType: "cargo_requests",
        entityId: id,
        description: `Phone-assisted ${payload.loadType} booking created`,
      },
    });
    return phoneStatus(row);
  },

  async listPhoneBookings({ status, search, page = 1, limit = 50 } = {}) {
    const where = { bookingChannel: "PHONE_ASSISTED" };
    if (status) where.status = status === "NOT_ASSIGNED" ? "Pending" : status.replace(/ /g, "_");
    if (search) {
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { senderName: { contains: search, mode: "insensitive" } },
        { senderPhone: { contains: search, mode: "insensitive" } },
        { receiverName: { contains: search, mode: "insensitive" } },
        { receiverPhone: { contains: search, mode: "insensitive" } },
      ];
    }
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;
    const [rows, total] = await Promise.all([
      prisma.cargoRequest.findMany({
        where,
        include: cargoRequestInclude,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.cargoRequest.count({ where }),
    ]);
    return { data: rows.map(phoneStatus), total, page: Number(page) };
  },

  async phoneAssignmentOptions(id) {
    const booking = await prisma.cargoRequest.findFirst({
      where: { id, bookingChannel: "PHONE_ASSISTED", status: "Pending" },
    });
    if (!booking) return null;

    const driverRules = {
      role: "driver",
      status: "Active",
      tripsAsDriver: { none: { status: { in: ACTIVE_TRIP_STATUSES } } },
    };

    if (booking.loadType === "FTL") {
      const trucks = await prisma.truck.findMany({
        where: {
          status: "Available",
          ...(booking.truckType ? { truckType: { equals: booking.truckType, mode: "insensitive" } } : {}),
          driver: { ...driverRules, OR: [{ serviceType: "FTL" }, { serviceType: null }] },
        },
        include: { driver: { select: { id: true, name: true, phone: true, lastSeenAt: true } } },
        orderBy: { createdAt: "asc" },
      });
      return {
        type: "FTL",
        data: trucks.map((truck) => ({
          id: truck.id,
          truckId: truck.id,
          driverId: truck.driverId,
          driver: truck.driver.name,
          driverPhone: truck.driver.phone,
          truckNumber: truck.truckNumber,
          plateNumber: truck.plateNumber,
          truckType: truck.truckType,
          capacity: truck.capacity,
          online: Boolean(truck.driver.lastSeenAt),
        })),
      };
    }

    const requiredTons = Number.parseFloat(booking.weight) || 0;
    const trips = await prisma.sharedTrip.findMany({
      where: {
        status: "Open for booking",
        availableTons: { gte: requiredTons },
        driver: { role: "driver", status: "Active" },
        truck: { status: { in: ["Available", "Busy"] } },
      },
      include: {
        driver: { select: { id: true, name: true, phone: true, lastSeenAt: true } },
        truck: true,
      },
      orderBy: { departureDate: "asc" },
    });
    return {
      type: "SHARED",
      data: trips.map((trip) => ({
        id: trip.id,
        sharedTripId: trip.id,
        driverId: trip.driverId,
        driver: trip.driver.name,
        driverPhone: trip.driver.phone,
        truckId: trip.truckId,
        truckNumber: trip.truck.truckNumber,
        plateNumber: trip.truck.plateNumber,
        route: `${trip.pickup} → ${trip.destination}`,
        availableTons: Number(trip.availableTons),
        online: Boolean(trip.driver.lastSeenAt),
      })),
    };
  },

  async assignPhoneBooking(id, { truckId, sharedTripId }, adminId) {
    return withTransaction(async (tx) => {
      const booking = await tx.cargoRequest.findFirst({
        where: { id, bookingChannel: "PHONE_ASSISTED", status: "Pending" },
      });
      if (!booking) return null;

      let driverId;
      let selectedTruckId;
      let sharedRemaining = null;
      if (booking.loadType === "FTL") {
        const truck = await tx.truck.findFirst({
          where: {
            id: truckId,
            status: "Available",
            driver: {
              role: "driver",
              status: "Active",
              tripsAsDriver: { none: { status: { in: ACTIVE_TRIP_STATUSES } } },
            },
          },
        });
        if (!truck) {
          const error = new Error("The selected driver is no longer active and available");
          error.status = 409;
          throw error;
        }
        driverId = truck.driverId;
        selectedTruckId = truck.id;
      } else {
        const requiredTons = Number.parseFloat(booking.weight) || 0;
        const sharedTrip = await tx.sharedTrip.findFirst({
          where: {
            id: sharedTripId,
            status: "Open for booking",
            availableTons: { gte: requiredTons },
            driver: {
              role: "driver",
              status: "Active",
            },
          },
        });
        if (!sharedTrip) {
          const error = new Error("The selected shared trip is no longer open or the driver is unavailable");
          error.status = 409;
          throw error;
        }
        driverId = sharedTrip.driverId;
        selectedTruckId = sharedTrip.truckId;
        const remaining = Number(sharedTrip.availableTons) - requiredTons;
        sharedRemaining = remaining;
        await tx.sharedTrip.update({
          where: { id: sharedTrip.id },
          data: { availableTons: remaining, status: remaining <= 0 ? "Full" : "Open for booking" },
        });
        await tx.sharedTripBooking.create({
          data: {
            sharedTripId: sharedTrip.id,
            customerId: booking.customerId,
            cargoRequestId: booking.id,
            weightTons: requiredTons,
            status: "Pending",
          },
        });
      }

      const now = new Date();

      // FTL phone bookings follow the same quote → accept → 30%/70% flow as online FTL.
      if (booking.loadType === "FTL") {
        await tx.cargoRequest.update({
          where: { id },
          data: {
            driverId,
            truckId: selectedTruckId,
            assignedByAdminId: adminId,
            assignedAt: now,
            status: "Pending",
          },
        });
        await tx.truck.update({
          where: { id: selectedTruckId },
          data: { status: "Busy" },
        });
        await tx.notification.create({
          data: {
            userId: driverId,
            type: "phone_booking.assigned",
            message: `Phone FTL booking ${booking.id}: confirm price & time. Trip starts after customer accepts and pays 30%.`,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: adminId,
            action: "phone_booking.assigned",
            entityType: "cargo_requests",
            entityId: booking.id,
            description: `FTL driver assigned to phone booking ${booking.id} — awaiting price & time`,
          },
        });
        const row = await tx.cargoRequest.findUnique({ where: { id }, include: cargoRequestInclude });
        return phoneStatus(row);
      }

      await tx.cargoRequest.update({
        where: { id },
        data: {
          driverId,
          truckId: selectedTruckId,
          assignedByAdminId: adminId,
          assignedAt: now,
          status: "Assigned",
        },
      });
      await tx.truck.update({
        where: { id: selectedTruckId },
        data: {
          status: booking.loadType === "SHARED" && sharedRemaining > 0 ? "Available" : "Busy",
        },
      });

      const tripId = `TRIP-${Math.floor(1000 + Math.random() * 9000)}`;
      await tx.trip.create({
        data: {
          id: tripId,
          cargoRequestId: booking.id,
          customerId: booking.customerId,
          driverId,
          truckId: selectedTruckId,
          dispatcherId: adminId,
          pickup: booking.pickup,
          destination: booking.destination,
          status: "Assigned",
          fare: booking.finalPrice || 0,
        },
      });
      await tx.notification.create({
        data: {
          userId: driverId,
          type: "phone_booking.assigned",
          message: `New ${booking.loadType} phone-assisted job ${tripId}: ${booking.pickup} → ${booking.destination}`,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "phone_booking.assigned",
          entityType: "cargo_requests",
          entityId: booking.id,
          description: `Driver and truck assigned to phone booking ${booking.id}`,
        },
      });

      const row = await tx.cargoRequest.findUnique({ where: { id }, include: cargoRequestInclude });
      return phoneStatus(row);
    });
  },
};
