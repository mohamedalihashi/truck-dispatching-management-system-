import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { tripStatusToApi, mapCustomerStatus } from "./db/mappers.js";
import { resolveLocationCoords } from "../lib/somaliaGeo.js";
import { tripProgress, msToAgoLabel } from "../lib/fleetTracking.js";

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** Default: active trip links last 7 days; after Delivered keep 24h. */
function defaultExpiresAt(tripStatusApi) {
  const hours =
    tripStatusApi === "Delivered" || tripStatusApi === "Cancelled"
      ? Number(process.env.TRACKING_LINK_POST_TRIP_HOURS || 24)
      : Number(process.env.TRACKING_LINK_ACTIVE_HOURS || 168);
  return new Date(Date.now() + hours * 3600_000);
}

const LIVE_STATUSES = new Set([
  "Assigned",
  "En Route to Pickup",
  "Arrived at Pickup",
  "Picked Up",
  "In Transit",
  "Near Destination",
]);

function parseDistanceKm(distance) {
  if (distance == null) return null;
  const n = Number(String(distance).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildTripTrackingPayload(trip, { includeDriverPhone = false } = {}) {
  if (!trip) return null;
  const status = tripStatusToApi(trip.status);
  const pickupPoint = resolveLocationCoords({
    text: trip.pickup,
    district: trip.cargoRequest?.fromDistrict,
    region: trip.cargoRequest?.fromRegion,
  });
  const destinationPoint = resolveLocationCoords({
    text: trip.destination,
    district: trip.cargoRequest?.toDistrict,
    region: trip.cargoRequest?.toRegion,
  });

  const showLive = LIVE_STATUSES.has(status) && trip.lastLat != null && trip.lastLng != null;
  const progress = tripProgress({
    plannedDistanceKm: parseDistanceKm(trip.distance),
    completedDistanceKm: trip.distanceTraveledKm != null ? Number(trip.distanceTraveledKm) : 0,
    currentLat: trip.lastLat,
    currentLng: trip.lastLng,
    destinationLat: destinationPoint.lat,
    destinationLng: destinationPoint.lng,
    speedKmh: trip.lastSpeedKmh,
  });

  return {
    tripId: trip.id,
    status,
    customerLabel: mapCustomerStatus(status),
    pickup: trip.pickup,
    destination: trip.destination,
    pickupPoint: { lat: pickupPoint.lat, lng: pickupPoint.lng },
    destinationPoint: { lat: destinationPoint.lat, lng: destinationPoint.lng },
    driver: trip.driver
      ? {
          name: trip.driver.name,
          phone: includeDriverPhone ? trip.driver.phone || null : null,
        }
      : null,
    vehicle: trip.truck
      ? {
          truckNumber: trip.truck.truckNumber,
          plateNumber: trip.truck.plateNumber,
          truckType: trip.truck.truckType,
        }
      : null,
    lastLocation: showLive
      ? {
          lat: trip.lastLat,
          lng: trip.lastLng,
          updatedAt: trip.lastLocationAt,
          speedKmh: trip.lastSpeedKmh != null ? Number(trip.lastSpeedKmh) : null,
          heading: trip.lastHeading != null ? Number(trip.lastHeading) : null,
          lastSeenLabel: msToAgoLabel(trip.lastLocationAt),
        }
      : null,
    trackingAllowed: showLive,
    progress,
    estimatedTime: trip.estimatedTime || null,
    updatedAt: trip.updatedAt,
  };
}

/** Customer-facing status titles (EN). */
export { mapCustomerStatus } from "./db/mappers.js";

const tripInclude = {
  driver: { select: { id: true, name: true, phone: true } },
  truck: { select: { truckNumber: true, plateNumber: true, truckType: true } },
  cargoRequest: {
    select: {
      fromDistrict: true,
      fromRegion: true,
      toDistrict: true,
      toRegion: true,
    },
  },
};

export async function createTrackingLink(tripId, { createdById = null, label = null, expiresAt = null } = {}) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true, status: true } });
  if (!trip) {
    const error = new Error("Trip not found");
    error.status = 404;
    throw error;
  }
  const status = tripStatusToApi(trip.status);
  if (status === "Cancelled") {
    const error = new Error("Cannot create a tracking link for a cancelled trip");
    error.status = 400;
    throw error;
  }

  // Long random token (not sequential trip id)
  const token = crypto.randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  const expires = expiresAt || defaultExpiresAt(status);

  // Revoke previous active links for this trip (one active share at a time)
  await prisma.trackingLink.updateMany({
    where: { tripId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.trackingLink.create({
    data: {
      tripId,
      tokenHash,
      label: label || null,
      expiresAt: expires,
      createdById: createdById || null,
    },
  });

  return {
    token,
    path: `/track/${token}`,
    expiresAt: expires,
    tripId,
  };
}

export async function revokeTrackingLink(tripId, { token = null } = {}) {
  if (token) {
    const updated = await prisma.trackingLink.updateMany({
      where: { tripId, tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return updated.count > 0;
  }
  const updated = await prisma.trackingLink.updateMany({
    where: { tripId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return updated.count > 0;
}

export async function getPublicTrackingByToken(token) {
  const cleaned = String(token || "").trim();
  if (!cleaned || cleaned.length < 16) {
    return { error: { status: 404, message: "Invalid tracking link" } };
  }

  const row = await prisma.trackingLink.findUnique({
    where: { tokenHash: hashToken(cleaned) },
    include: { trip: { include: tripInclude } },
  });

  if (!row) return { error: { status: 404, message: "Invalid tracking link" } };
  if (row.revokedAt) return { error: { status: 410, message: "This tracking link has been revoked" } };
  if (row.expiresAt <= new Date()) {
    return { error: { status: 410, message: "This tracking link has expired" } };
  }

  // Touch last viewed (best-effort)
  prisma.trackingLink
    .update({ where: { id: row.id }, data: { lastViewedAt: new Date() } })
    .catch(() => {});

  return {
    data: {
      ...buildTripTrackingPayload(row.trip, { includeDriverPhone: false }),
      expiresAt: row.expiresAt,
      linkLabel: row.label,
    },
  };
}

export async function getTripTrackingForViewer(tripId, { customerId = null, role = null } = {}) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: tripInclude,
  });
  if (!trip) return null;
  if (role === "customer" && trip.customerId !== customerId) {
    const error = new Error("Not allowed to track this trip");
    error.status = 403;
    throw error;
  }
  return buildTripTrackingPayload(trip, {
    includeDriverPhone: role === "customer" || role === "admin",
  });
}
