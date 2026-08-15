import { prisma } from "../../lib/prisma.js";
import { mapTruck } from "./mappers.js";
import { tripStatusToApi } from "./mappers.js";
import {
  FLEET_DEFAULTS,
  getFleetSettings,
  resolveGpsStatus,
  tripProgress,
  msToAgoLabel,
} from "../../lib/fleetTracking.js";
import { coordsFromPlaceName } from "../../lib/somaliaGeo.js";
import { emitUserNotification } from "../../lib/notifyRealtime.js";

const ACTIVE_TRIP_STATUSES = [
  "Assigned",
  "En_Route_to_Pickup",
  "Arrived_at_Pickup",
  "Picked_Up",
  "In_Transit",
  "Near_Destination",
];

export const fleetRepository = {
  async listLiveFleet({ search, gpsStatus, io } = {}) {
    const settings = getFleetSettings(FLEET_DEFAULTS);
    const where = {};
    if (search) {
      where.OR = [
        { truckNumber: { contains: search, mode: "insensitive" } },
        { plateNumber: { contains: search, mode: "insensitive" } },
        { driver: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const trucks = await prisma.truck.findMany({
      where,
      include: {
        driver: { select: { id: true, name: true, phone: true } },
        trips: {
          where: { status: { in: ACTIVE_TRIP_STATUSES } },
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: {
            cargoRequest: {
              select: {
                distanceKm: true,
                destination: true,
                toRegion: true,
                toDistrict: true,
              },
            },
          },
        },
      },
      orderBy: { truckNumber: "asc" },
      take: 200,
    });

    const now = Date.now();
    const offlineAlerts = [];
    const data = [];

    for (const truck of trucks) {
      const derived = resolveGpsStatus({
        lastLocationAt: truck.lastLocationAt,
        speedKmh: truck.lastSpeedKmh,
        now,
        settings,
      });

      if (truck.gpsStatus !== derived) {
        await prisma.truck.update({
          where: { id: truck.id },
          data: { gpsStatus: derived },
        });
        if (derived === "OFFLINE" && truck.gpsStatus !== "OFFLINE" && truck.lastLocationAt) {
          offlineAlerts.push(truck);
        }
      }

      if (gpsStatus && derived !== gpsStatus) continue;

      const activeTrip = truck.trips[0] || null;

      // Prefer the active trip's live GPS when it is newer (or truck has none).
      // Otherwise the map can stay stuck on an old truck pin / registration area.
      const tripHasGps = activeTrip?.lastLat != null && activeTrip?.lastLng != null;
      const truckHasGps = truck.lastLat != null && truck.lastLng != null;
      const tripNewer =
        tripHasGps &&
        (!truck.lastLocationAt ||
          !activeTrip.lastLocationAt ||
          new Date(activeTrip.lastLocationAt).getTime() >= new Date(truck.lastLocationAt).getTime());
      const liveLat = tripHasGps && (tripNewer || !truckHasGps) ? Number(activeTrip.lastLat) : truck.lastLat;
      const liveLng = tripHasGps && (tripNewer || !truckHasGps) ? Number(activeTrip.lastLng) : truck.lastLng;
      const liveAt =
        tripHasGps && (tripNewer || !truckHasGps) ? activeTrip.lastLocationAt : truck.lastLocationAt;
      const liveSpeed =
        tripHasGps && (tripNewer || !truckHasGps)
          ? activeTrip.lastSpeedKmh != null
            ? Number(activeTrip.lastSpeedKmh)
            : null
          : truck.lastSpeedKmh != null
            ? Number(truck.lastSpeedKmh)
            : null;
      const liveHeading =
        tripHasGps && (tripNewer || !truckHasGps)
          ? activeTrip.lastHeading != null
            ? Number(activeTrip.lastHeading)
            : null
          : truck.lastHeading != null
            ? Number(truck.lastHeading)
            : null;

      const dest = activeTrip
        ? coordsFromPlaceName(activeTrip.destination) ||
          coordsFromPlaceName(
            [activeTrip.cargoRequest?.toRegion, activeTrip.cargoRequest?.toDistrict]
              .filter(Boolean)
              .join(" ")
          )
        : null;
      const progress = activeTrip
        ? tripProgress({
            plannedDistanceKm:
              activeTrip.cargoRequest?.distanceKm != null
                ? Number(activeTrip.cargoRequest.distanceKm)
                : null,
            completedDistanceKm: Number(activeTrip.distanceTraveledKm || 0),
            currentLat: liveLat,
            currentLng: liveLng,
            destinationLat: dest?.lat,
            destinationLng: dest?.lng,
            speedKmh: liveSpeed,
          })
        : null;

      const lastLocation =
        liveLat != null && liveLng != null
          ? {
              lat: Number(liveLat),
              lng: Number(liveLng),
              updatedAt: liveAt,
              speedKmh: liveSpeed,
              heading: liveHeading,
            }
          : null;

      data.push({
        ...mapTruck({ ...truck, gpsStatus: derived }),
        gpsStatus: derived,
        lastLocation,
        lastSeenLabel: msToAgoLabel(liveAt || truck.lastLocationAt, now),
        activeTrip: activeTrip
          ? {
              id: activeTrip.id,
              status: tripStatusToApi(activeTrip.status),
              pickup: activeTrip.pickup,
              destination: activeTrip.destination,
              distanceTraveledKm:
                activeTrip.distanceTraveledKm != null
                  ? Number(activeTrip.distanceTraveledKm)
                  : null,
              progress,
              lastLocation: tripHasGps
                ? {
                    lat: Number(activeTrip.lastLat),
                    lng: Number(activeTrip.lastLng),
                    updatedAt: activeTrip.lastLocationAt,
                    speedKmh:
                      activeTrip.lastSpeedKmh != null ? Number(activeTrip.lastSpeedKmh) : null,
                    heading:
                      activeTrip.lastHeading != null ? Number(activeTrip.lastHeading) : null,
                  }
                : null,
            }
          : null,
      });
    }

    if (io && offlineAlerts.length) {
      const admins = await prisma.user.findMany({
        where: { role: "admin" },
        select: { id: true },
        take: 30,
      });
      for (const truck of offlineAlerts) {
        const message = `Truck ${truck.truckNumber} has lost GPS connection.`;
        io.emit("truck:offline", {
          truckId: truck.id,
          truckNumber: truck.truckNumber,
          message,
          lastSeen: truck.lastLocationAt,
        });
        for (const admin of admins) {
          const notification = await prisma.notification.create({
            data: { userId: admin.id, type: "truck:offline", message },
          });
          emitUserNotification(io, {
            id: notification.id,
            userId: admin.id,
            type: notification.type,
            message: notification.message,
            read: false,
            createdAt: notification.createdAt,
          });
        }
      }
    }

    const summary = {
      totalTrucks: data.length,
      online: data.filter((t) => t.gpsStatus === "MOVING" || t.gpsStatus === "IDLE").length,
      moving: data.filter((t) => t.gpsStatus === "MOVING").length,
      idle: data.filter((t) => t.gpsStatus === "IDLE").length,
      offline: data.filter((t) => t.gpsStatus === "OFFLINE").length,
      activeTrips: data.filter((t) => t.activeTrip).length,
    };

    return { data, summary, settings };
  },

  async listGeofences() {
    const rows = await prisma.geofence.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      zoneType: row.zoneType,
      centerLat: row.centerLat,
      centerLng: row.centerLng,
      radiusM: row.radiusM,
      active: row.active,
      createdAt: row.createdAt,
    }));
  },

  async createGeofence(payload, createdById) {
    const row = await prisma.geofence.create({
      data: {
        name: String(payload.name || "").trim(),
        zoneType: String(payload.zoneType || "Checkpoint").trim(),
        centerLat: Number(payload.centerLat),
        centerLng: Number(payload.centerLng),
        radiusM: Number(payload.radiusM),
        active: payload.active !== false,
        createdById: createdById || null,
      },
    });
    return {
      id: row.id,
      name: row.name,
      zoneType: row.zoneType,
      centerLat: row.centerLat,
      centerLng: row.centerLng,
      radiusM: row.radiusM,
      active: row.active,
    };
  },

  async deleteGeofence(id) {
    await prisma.geofence.delete({ where: { id } }).catch(() => null);
    return true;
  },

  async listTripEvents(tripId, { userId, role } = {}) {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return null;
    if (role === "customer" && trip.customerId !== userId) {
      const error = new Error("Not allowed");
      error.status = 403;
      throw error;
    }
    if (role === "driver" && trip.driverId !== userId) {
      const error = new Error("Not allowed");
      error.status = 403;
      throw error;
    }
    const events = await prisma.tripEvent.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      lat: e.lat,
      lng: e.lng,
      meta: e.meta,
      at: e.createdAt,
    }));
  },

  async getTripReplay(tripId, { userId, role } = {}) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        driver: { select: { name: true } },
        truck: { select: { truckNumber: true, plateNumber: true } },
      },
    });
    if (!trip) return null;
    if (role === "customer" && trip.customerId !== userId) {
      const error = new Error("Not allowed");
      error.status = 403;
      throw error;
    }
    if (role === "driver" && trip.driverId !== userId) {
      const error = new Error("Not allowed");
      error.status = 403;
      throw error;
    }

    const points = await prisma.tripLocationPoint.findMany({
      where: { tripId },
      orderBy: { recordedAt: "asc" },
      take: 500,
    });

    return {
      tripId,
      truck: trip.truck?.truckNumber || null,
      plateNumber: trip.truck?.plateNumber || null,
      driver: trip.driver?.name || null,
      pickup: trip.pickup,
      destination: trip.destination,
      status: tripStatusToApi(trip.status),
      points: points.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        speedKmh: p.speedKmh != null ? Number(p.speedKmh) : null,
        heading: p.heading != null ? Number(p.heading) : null,
        at: p.recordedAt,
      })),
    };
  },
};
