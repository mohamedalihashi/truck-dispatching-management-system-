import { prisma, withTransaction } from "../../lib/prisma.js";
import { auditFields } from "../../lib/auditContext.js";
import { buildWaafiReferenceId } from "../waafiPayService.js";
import { cargoStatusFromTripStatus, validateTripStatusChange } from "../../lib/tripStatus.js";
import {
  customerMessageForTripStatus,
  formatCustomerNotifyLine,
  formatNotifyLines,
  deliveryConfirmCode,
} from "../../lib/tripCustomerMessages.js";
import { haversineKm, shouldRecordPoint, coordsFromPlaceName } from "../../lib/somaliaGeo.js";
import {
  FLEET_DEFAULTS,
  getFleetSettings,
  resolveGpsStatus,
  tripProgress,
  maxDeviationFromRouteM,
  pointInGeofence,
  msToAgoLabel,
} from "../../lib/fleetTracking.js";
import { emitUserNotification } from "../../lib/notifyRealtime.js";
import { fareFromTraveledKm } from "../pricingRates.js";
import {
  formatMeasuredQuantity,
  normalizeMeasurementUnit,
  resolveCargoMeasurement,
  resolvePickupMeasurements,
  validateMeasuredQuantity,
} from "../../lib/cargoMeasurement.js";
import {
  mapTrip,
  mapFeedbackListItem,
  mapNotification,
  tripInclude,
  feedbackListInclude,
  tripStatusToDb,
  tripStatusToApi,
  reqStatusToDb,
} from "./mappers.js";

/** Billable GPS distance: only after cargo is on the truck (not while waiting at pickup). */
const GPS_DISTANCE_STATUSES = new Set([
  "Picked_Up",
  "In_Transit",
  "Near_Destination",
]);

/**
 * Minimum GPS segment to count for billing (km).
 * Phone GPS while stationary often jitters 10–40 m — 50 m filters most idle drift.
 */
const MIN_BILLING_SEGMENT_KM = 0.05;
/** Reject teleport-sized jumps between pings (bad fix / tunnel). */
const MAX_BILLING_SEGMENT_KM = 1.5;
/** Ignore low-accuracy fixes for distance (meters). */
const MAX_ACCURACY_M_FOR_BILLING = 45;

export const tripRepository = {
async listTrips({ status, driverId, customerId, search, page = 1, limit = 50 } = {}) {
  const and = [];
  if (status) and.push({ status: tripStatusToDb(status) });
  if (driverId) and.push({ driverId });
  if (customerId) and.push({ customerId });
  if (search) {
    and.push({
      OR: [
        { id: { contains: search, mode: "insensitive" } },
        { pickup: { contains: search, mode: "insensitive" } },
        { destination: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { driver: { name: { contains: search, mode: "insensitive" } } },
        { truck: { truckNumber: { contains: search, mode: "insensitive" } } },
        { truck: { plateNumber: { contains: search, mode: "insensitive" } } },
      ],
    });
  }
  const where = and.length ? { AND: and } : {};
  const offset = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    prisma.trip.findMany({
      where,
      include: tripInclude,
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: offset,
    }),
    prisma.trip.count({ where }),
  ]);
  return { data: data.map(mapTrip), total, page: Number(page) };
},

async tripSummary({ driverId, customerId } = {}) {
  const where = {};
  if (driverId) where.driverId = driverId;
  if (customerId) where.customerId = customerId;

  const activeStatuses = [
    "Assigned",
    "En_Route_to_Pickup",
    "Arrived_at_Pickup",
    "Picked_Up",
    "In_Transit",
    "Near_Destination",
  ];

  const [total, active, pending, cancelled, delivered] = await Promise.all([
    prisma.trip.count({ where }),
    prisma.trip.count({ where: { ...where, status: { in: activeStatuses } } }),
    prisma.trip.count({ where: { ...where, status: "Pending" } }),
    prisma.trip.count({ where: { ...where, status: "Cancelled" } }),
    prisma.trip.count({ where: { ...where, status: "Delivered" } }),
  ]);

  return { total, active, pending, cancelled, delivered };
},

async updateTripStatus(id, status, actorId, { driverId, role, weight, measuredQuantity, measurementUnit, measurements, deliveryConfirmCode: confirmCodeInput } = {}) {
  const existing = await prisma.trip.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      driver: { select: { id: true, name: true, phone: true } },
      truck: { select: { truckNumber: true, plateNumber: true, truckType: true } },
      cargoRequest: {
        select: {
          bookingChannel: true,
          cargoType: true,
          weight: true,
          measuredQuantity: true,
          measurementUnit: true,
          description: true,
          loadType: true,
          pickup: true,
          destination: true,
          fromRegion: true,
          fromDistrict: true,
          toRegion: true,
          toDistrict: true,
          distanceKm: true,
          senderName: true,
          receiverName: true,
        },
      },
    },
  });
  if (!existing) return null;
  if (driverId && existing.driverId !== driverId) {
    const error = new Error("Not allowed to update this trip");
    error.status = 403;
    throw error;
  }

  const currentStatus = tripStatusToApi(existing.status);
  const validation = validateTripStatusChange({
    currentStatus,
    nextStatus: status,
    role,
    hasDeliveryProof: Boolean(existing.deliveryProofUrl),
  });
  if (!validation.ok) {
    const error = new Error(validation.message);
    error.status = validation.status;
    throw error;
  }

  if (status === "Delivered") {
    const expected = deliveryConfirmCode(id);
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
  }

  let pickupMeasurement = null;
  if (status === "Picked Up") {
    const cargoType = existing.cargoRequest?.cargoType;
    const resolved = resolvePickupMeasurements(
      { measuredQuantity, measurementUnit, measurements, weightKg: weight },
      cargoType
    );
    if (!resolved.ok) {
      const error = new Error(resolved.message || `Enter quantity when marking Picked Up`);
      error.status = 400;
      throw error;
    }
    pickupMeasurement = {
      measuredQuantity: resolved.measuredQuantity,
      measurementUnit: resolved.measurementUnit,
      weightLabel: resolved.weightLabel,
    };
  }

  const dbStatus = tripStatusToDb(status);
  const pickedUpWeight = pickupMeasurement?.weightLabel || null;

  return withTransaction(async (tx) => {
    const trip = await tx.trip.update({
      where: { id },
      data: {
        status: dbStatus,
        // Discard pre-pickup GPS jitter; haul distance starts at Picked Up.
        ...(status === "Picked Up"
          ? { distanceTraveledKm: 0, distance: "0 km (GPS)" }
          : {}),
      },
    });

    // Sync cargo request status (+ store driver-entered weight at pickup)
    if (trip.cargoRequestId) {
      const requestStatus = cargoStatusFromTripStatus(status);
      const allowed = [
        "Pending",
        "Assigned",
        "En Route to Pickup",
        "Arrived at Pickup",
        "Picked Up",
        "In Transit",
        "Near Destination",
        "Delivered",
        "Cancelled",
      ];
      if (allowed.includes(requestStatus)) {
        const cargoData = { status: reqStatusToDb(requestStatus) };
        if (pickupMeasurement) {
          cargoData.weight = pickupMeasurement.weightLabel;
          cargoData.measuredQuantity = pickupMeasurement.measuredQuantity;
          cargoData.measurementUnit = pickupMeasurement.measurementUnit;
          const prevDesc = existing.cargoRequest?.description || "";
          const label = pickupMeasurement.weightLabel;
          if (!prevDesc || /TBD|Pending|N\/A/i.test(prevDesc) || prevDesc === existing.cargoRequest?.weight) {
            cargoData.description = prevDesc && !/—/.test(prevDesc)
              ? `${prevDesc} — ${label}`
              : `${prevDesc || "Cargo"} — ${label}`;
          } else if (!prevDesc.includes(label)) {
            cargoData.description = `${prevDesc} · ${label}`;
          }
        } else if (pickedUpWeight) {
          cargoData.weight = pickedUpWeight;
          const prevDesc = existing.cargoRequest?.description || "";
          if (!prevDesc || /TBD|Pending|N\/A/i.test(prevDesc) || prevDesc === existing.cargoRequest?.weight) {
            cargoData.description = prevDesc && !/—/.test(prevDesc)
              ? `${prevDesc} — ${pickedUpWeight}`
              : `${prevDesc || "Cargo"} — ${pickedUpWeight}`;
          } else if (!prevDesc.includes(pickedUpWeight)) {
            cargoData.description = `${prevDesc} · ${pickedUpWeight}`;
          }
        }
        await tx.cargoRequest.update({
          where: { id: trip.cargoRequestId },
          data: cargoData,
        });
      }
    }

    // Release truck & handle payment on terminal statuses
    if (status === "Delivered" || status === "Cancelled") {
      if (trip.truckId) {
        await tx.truck.update({
          where: { id: trip.truckId },
          data: { status: "Available" },
        });
      }
      if (status === "Delivered") {
        let finalFare = Number(existing.fare);
        const traveledKm = Number(existing.distanceTraveledKm || 0);
        const cargo = existing.cargoRequest;
        if (cargo) {
          const gpsFare = await fareFromTraveledKm(
            cargo.weight || "1 kg",
            cargo.loadType || "FTL",
            traveledKm,
            {
              cargoType: cargo.cargoType,
              measuredQuantity: cargo.measuredQuantity,
              measurementUnit: cargo.measurementUnit,
              routeDistanceKm: cargo.distanceKm != null ? Number(cargo.distanceKm) : null,
            }
          );
          if (gpsFare != null) {
            finalFare = gpsFare;
            const kmLabel = `${Math.round(traveledKm * 10) / 10} km (GPS)`;
            await tx.trip.update({
              where: { id },
              data: {
                fare: finalFare,
                distance: kmLabel,
                distanceTraveledKm: Math.round(traveledKm * 100) / 100,
              },
            });
            if (trip.cargoRequestId) {
              await tx.cargoRequest.update({
                where: { id: trip.cargoRequestId },
                data: {
                  finalPrice: finalFare,
                  quotedPrice: finalFare,
                  calculatedPrice: finalFare,
                  distanceKm: Math.round(traveledKm * 100) / 100,
                },
              });
            }
          }
        }

        const existingPayment = await tx.payment.findFirst({
          where: { tripId: trip.id },
        });
        if (!existingPayment) {
          await tx.payment.create({
            data: {
              trip: { connect: { id: trip.id } },
              customer: { connect: { id: trip.customerId } },
              amount: finalFare,
              amountPaid: 0,
              status: "Pending",
              method: "waafipay",
              provider: "waafipay",
              currency: process.env.WAAFI_CURRENCY || "SLSH",
              referenceId: buildWaafiReferenceId(trip.id),
              description: `Shipment ${trip.id} — ${trip.pickup} to ${trip.destination}`,
            },
          });
        } else if (Number(existingPayment.amountPaid || 0) <= 0 && finalFare !== Number(existingPayment.amount)) {
          await tx.payment.update({
            where: { id: existingPayment.id },
            data: { amount: finalFare },
          });
        }
      }
    }

    const typeMap = {
      "En Route to Pickup": "cargo.en_route_pickup",
      "Arrived at Pickup": "cargo.arrived_pickup",
      "Picked Up": "cargo.picked_up",
      "In Transit": "cargo.in_transit",
      "Near Destination": "cargo.near_destination",
      Delivered: "cargo.delivered",
    };

    const customerCopy = customerMessageForTripStatus(status, { tripId: id });
    const weightNote = pickedUpWeight ? `Culeys / cabbir: ${pickedUpWeight}.` : "";
    const pickupAddr =
      existing.cargoRequest?.pickup ||
      [existing.cargoRequest?.fromRegion, existing.cargoRequest?.fromDistrict].filter(Boolean).join(", ") ||
      existing.pickup;
    const destAddr =
      existing.cargoRequest?.destination ||
      [existing.cargoRequest?.toRegion, existing.cargoRequest?.toDistrict].filter(Boolean).join(", ") ||
      existing.destination;
    const notification = await tx.notification.create({
      data: {
        userId: trip.customerId,
        type: typeMap[status] || "trip.status.updated",
        message:
          formatCustomerNotifyLine(customerCopy, {
            tripId: id,
            status,
            customerName:
              existing.customer?.name ||
              existing.cargoRequest?.senderName ||
              existing.cargoRequest?.receiverName ||
              null,
            driverName: existing.driver?.name || null,
            truckType: existing.truck?.truckType || null,
            plateNumber: existing.truck?.plateNumber || null,
            truckNumber: existing.truck?.truckNumber || null,
            pickup: pickupAddr,
            destination: destAddr,
            fromRegion: existing.cargoRequest?.fromRegion,
            fromDistrict: existing.cargoRequest?.fromDistrict,
            toRegion: existing.cargoRequest?.toRegion,
            toDistrict: existing.cargoRequest?.toDistrict,
            extra: weightNote || undefined,
          }) || `${id} updated to ${status}`,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "trip.status.updated",
        entityType: "trips",
        entityId: id,
        meta: { status },
      },
    });

    const joined = await tx.trip.findUnique({
      where: { id },
      include: tripInclude,
    });

    return { trip: mapTrip(joined), notification: mapNotification(notification) };
  });
},

async updateTripLocation(id, { lat, lng, accuracy, speed, speedKmh: speedKmhIn, heading, timestamp }, { driverId, io } = {}) {
  const existing = await prisma.trip.findUnique({
    where: { id },
    include: {
      truck: { select: { id: true, truckNumber: true, gpsStatus: true } },
      cargoRequest: {
        select: {
          pickup: true,
          destination: true,
          fromRegion: true,
          fromDistrict: true,
          toRegion: true,
          toDistrict: true,
          distanceKm: true,
        },
      },
    },
  });
  if (!existing) return null;
  if (driverId && existing.driverId !== driverId) {
    const error = new Error("Not allowed to update this trip location");
    error.status = 403;
    throw error;
  }

  const lngNum = Number(lng);
  const latNum = Number(lat);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    const error = new Error("Invalid GPS coordinates");
    error.status = 400;
    throw error;
  }
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    const error = new Error("GPS coordinates out of range");
    error.status = 400;
    throw error;
  }

  const accuracyM = accuracy != null ? Number(accuracy) : null;
  const accuracyOk =
    accuracyM == null || !Number.isFinite(accuracyM) || accuracyM <= MAX_ACCURACY_M_FOR_BILLING;

  let speedKmh = null;
  if (speedKmhIn != null && Number.isFinite(Number(speedKmhIn))) {
    speedKmh = Math.round(Number(speedKmhIn) * 10) / 10;
  } else if (speed != null && Number.isFinite(Number(speed))) {
    // Geolocation Position.coords.speed is m/s
    speedKmh = Math.round(Number(speed) * 3.6 * 10) / 10;
  }

  let headingDeg = heading != null ? Number(heading) : null;
  if (!Number.isFinite(headingDeg) || headingDeg < 0 || headingDeg > 360) headingDeg = null;

  const recordedAt =
    timestamp != null && !Number.isNaN(new Date(timestamp).getTime())
      ? new Date(timestamp)
      : new Date();
  // Reject future timestamps > 2 min or older than 30 min (anti-spoof soft check).
  const skewMs = recordedAt.getTime() - Date.now();
  if (skewMs > 120_000 || skewMs < -30 * 60_000) {
    const error = new Error("Invalid GPS timestamp");
    error.status = 400;
    throw error;
  }

  const countsForDistance = GPS_DISTANCE_STATUSES.has(String(existing.status));
  let addedKm = 0;
  if (
    countsForDistance &&
    accuracyOk &&
    existing.lastLat != null &&
    existing.lastLng != null &&
    shouldRecordPoint(existing.lastLat, existing.lastLng, latNum, lngNum, MIN_BILLING_SEGMENT_KM)
  ) {
    const segment = haversineKm(existing.lastLat, existing.lastLng, latNum, lngNum);
    if (segment >= MIN_BILLING_SEGMENT_KM && segment <= MAX_BILLING_SEGMENT_KM) {
      addedKm = segment;
    }
  }

  const prevTraveled = Number(existing.distanceTraveledKm || 0);
  const nextTraveled = countsForDistance ? prevTraveled + addedKm : 0;
  const kmLabel = `${Math.round(nextTraveled * 10) / 10} km (GPS)`;
  const settings = getFleetSettings(FLEET_DEFAULTS);
  const gpsStatus = resolveGpsStatus({
    lastLocationAt: recordedAt,
    speedKmh: speedKmh ?? 0,
    settings,
  });

  const trip = await prisma.trip.update({
    where: { id },
    data: {
      lastLat: latNum,
      lastLng: lngNum,
      lastLocationAt: recordedAt,
      lastSpeedKmh: speedKmh,
      lastHeading: headingDeg,
      lastAccuracyM: Number.isFinite(accuracyM) ? accuracyM : null,
      ...(countsForDistance
        ? {
            distanceTraveledKm: Math.round(nextTraveled * 100) / 100,
            distance: kmLabel,
          }
        : {
            distanceTraveledKm: 0,
            distance: null,
          }),
    },
  });

  if (existing.truckId) {
    await prisma.truck.update({
      where: { id: existing.truckId },
      data: {
        lastLat: latNum,
        lastLng: lngNum,
        lastLocationAt: recordedAt,
        lastSpeedKmh: speedKmh,
        lastHeading: headingDeg,
        gpsStatus,
      },
    });
  }

  const shouldStorePoint = shouldRecordPoint(
    existing.lastLat,
    existing.lastLng,
    latNum,
    lngNum,
    MIN_BILLING_SEGMENT_KM
  );
  if (shouldStorePoint) {
    await prisma.tripLocationPoint.create({
      data: {
        tripId: id,
        lat: latNum,
        lng: lngNum,
        speedKmh,
        heading: headingDeg,
        accuracyM: Number.isFinite(accuracyM) ? accuracyM : null,
        recordedAt,
      },
    });

    const extra = await prisma.tripLocationPoint.count({ where: { tripId: id } });
    if (extra > 500) {
      const stale = await prisma.tripLocationPoint.findMany({
        where: { tripId: id },
        orderBy: { recordedAt: "asc" },
        take: extra - 500,
        select: { id: true },
      });
      if (stale.length) {
        await prisma.tripLocationPoint.deleteMany({
          where: { id: { in: stale.map((row) => row.id) } },
        });
      }
    }
  }

  const destCoords = coordsFromPlaceName(
    existing.cargoRequest?.destination || existing.destination
  ) || coordsFromPlaceName(
    [existing.cargoRequest?.toRegion, existing.cargoRequest?.toDistrict].filter(Boolean).join(" ")
  );
  const plannedKm =
    existing.cargoRequest?.distanceKm != null
      ? Number(existing.cargoRequest.distanceKm)
      : null;
  const progress = tripProgress({
    plannedDistanceKm: plannedKm,
    completedDistanceKm: nextTraveled,
    currentLat: latNum,
    currentLng: lngNum,
    destinationLat: destCoords?.lat,
    destinationLng: destCoords?.lng,
    speedKmh: speedKmh ?? 0,
  });

  const alerts = [];

  // Route deviation vs recent trail (planned polyline ≈ recent GPS trail).
  if (shouldStorePoint && existing.truckId) {
    const recent = await prisma.tripLocationPoint.findMany({
      where: { tripId: id },
      orderBy: { recordedAt: "desc" },
      take: 40,
      select: { lat: true, lng: true },
    });
    const route = [...recent].reverse();
    if (route.length >= 5) {
      const deviationM = maxDeviationFromRouteM({ lat: latNum, lng: lngNum }, route.slice(0, -1));
      if (deviationM > settings.routeDeviationM) {
        alerts.push({
          type: "truck:route-deviation",
          message: `Truck ${existing.truck?.truckNumber || existing.truckId} has drifted ${Math.round(deviationM)}m from its recent route.`,
        });
      }
    }
  }

  if (speedKmh != null && speedKmh > settings.overspeedKmh) {
    alerts.push({
      type: "truck:overspeed",
      message: `Truck ${existing.truck?.truckNumber || existing.truckId} overspeed: ${speedKmh} km/h.`,
    });
  }

  // Geofence enter/exit (compare previous point).
  const fences = await prisma.geofence.findMany({ where: { active: true }, take: 100 });
  if (fences.length && existing.lastLat != null && existing.lastLng != null) {
    const prev = { lat: existing.lastLat, lng: existing.lastLng };
    const curr = { lat: latNum, lng: lngNum };
    for (const fence of fences) {
      const wasInside = pointInGeofence(prev, fence);
      const isInside = pointInGeofence(curr, fence);
      if (!wasInside && isInside) {
        alerts.push({
          type: "geofence:entered",
          message: `Truck ${existing.truck?.truckNumber || "—"} entered ${fence.name}`,
          meta: { geofenceId: fence.id, zoneType: fence.zoneType },
        });
      } else if (wasInside && !isInside) {
        alerts.push({
          type: "geofence:exited",
          message: `Truck ${existing.truck?.truckNumber || "—"} exited ${fence.name}`,
          meta: { geofenceId: fence.id, zoneType: fence.zoneType },
        });
      }
    }
  }

  // GPS reconnected
  if (existing.truck?.gpsStatus === "OFFLINE" && gpsStatus !== "OFFLINE") {
    alerts.push({
      type: "truck:online",
      message: `Truck ${existing.truck?.truckNumber || existing.truckId} GPS reconnected.`,
    });
  }

  for (const alert of alerts) {
    await prisma.tripEvent.create({
      data: {
        tripId: id,
        truckId: existing.truckId,
        type: alert.type,
        message: alert.message,
        lat: latNum,
        lng: lngNum,
        meta: alert.meta || undefined,
      },
    });
  }

  if (io && alerts.length) {
    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      select: { id: true },
      take: 30,
    });
    for (const alert of alerts) {
      io.emit(alert.type, {
        tripId: id,
        truckId: existing.truckId,
        message: alert.message,
        lat: latNum,
        lng: lngNum,
        at: recordedAt.toISOString(),
      });
      for (const admin of admins) {
        const notification = await prisma.notification.create({
          data: {
            userId: admin.id,
            type: alert.type,
            message: alert.message,
          },
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

  return {
    id,
    truckId: existing.truckId,
    status: tripStatusToApi(trip.status),
    lastLocation: {
      lat: latNum,
      lng: lngNum,
      updatedAt: recordedAt.toISOString(),
      speedKmh,
      heading: headingDeg,
      accuracyM: Number.isFinite(accuracyM) ? accuracyM : null,
    },
    gpsStatus,
    distanceTraveledKm: Number(trip.distanceTraveledKm || nextTraveled || 0),
    distance: trip.distance,
    progress,
    lastSeenLabel: msToAgoLabel(recordedAt),
    alerts,
  };
},

async listTripLocationHistory(tripId, { userId, role } = {}) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return null;

  if (role === "customer" && trip.customerId !== userId) {
    const error = new Error("Not allowed to view this trip route");
    error.status = 403;
    throw error;
  }
  if (role === "driver" && trip.driverId !== userId) {
    const error = new Error("Not allowed to view this trip route");
    error.status = 403;
    throw error;
  }

  const points = await prisma.tripLocationPoint.findMany({
    where: { tripId },
    orderBy: { recordedAt: "asc" },
    take: 500,
    select: {
      lat: true,
      lng: true,
      speedKmh: true,
      heading: true,
      accuracyM: true,
      recordedAt: true,
    },
  });

  return points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    speedKmh: p.speedKmh != null ? Number(p.speedKmh) : null,
    heading: p.heading != null ? Number(p.heading) : null,
    accuracyM: p.accuracyM != null ? Number(p.accuracyM) : null,
    at: p.recordedAt,
  }));
},

async uploadTripProof(id, { deliveryProofUrl, signatureUrl }, { driverId } = {}) {
  const existing = await prisma.trip.findUnique({ where: { id } });
  if (!existing) return null;
  if (driverId && existing.driverId !== driverId) {
    const error = new Error("Not allowed to upload proof for this trip");
    error.status = 403;
    throw error;
  }

  const data = {};
  if (deliveryProofUrl) data.deliveryProofUrl = deliveryProofUrl;
  if (signatureUrl) data.signatureUrl = signatureUrl;

  const trip = await prisma.trip.update({
    where: { id },
    data,
  }).catch(() => null);

  if (!trip) return null;
  await prisma.auditLog.create({
    data: auditFields({
      userId: driverId || existing.driverId,
      action: "trip.proof.uploaded",
      entityType: "trips",
      entityId: id,
      description: `Proof of delivery uploaded for trip ${id}`,
      oldValues: { deliveryProofUrl: existing.deliveryProofUrl, signatureUrl: existing.signatureUrl },
      newValues: { deliveryProofUrl: trip.deliveryProofUrl, signatureUrl: trip.signatureUrl },
    }),
  });
  return { id, deliveryProofUrl: trip.deliveryProofUrl, signatureUrl: trip.signatureUrl };
},

async submitTripFeedback(tripId, customerId, { rating, productRating, comment }) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return null;
  if (trip.customerId !== customerId) {
    const error = new Error("Not allowed to rate this trip");
    error.status = 403;
    throw error;
  }
  if (tripStatusToApi(trip.status) !== "Delivered") {
    const error = new Error("Feedback is only allowed after delivery");
    error.status = 400;
    throw error;
  }

  const existing = await prisma.tripFeedback.findUnique({ where: { tripId } });
  if (existing) {
    const error = new Error("Feedback already submitted for this trip");
    error.status = 409;
    throw error;
  }

  return withTransaction(async (tx) => {
    await tx.tripFeedback.create({
      data: {
        tripId,
        customerId,
        driverId: trip.driverId,
        rating,
        productRating: productRating ?? null,
        comment: comment?.trim() || null,
      },
    });

    if (trip.driverId) {
      await tx.notification.create({
        data: {
          userId: trip.driverId,
          type: "trip.feedback.received",
          message: `Customer rated trip ${tripId}: ${rating}/5 stars`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: customerId,
        action: "trip.feedback.submitted",
        entityType: "trips",
        entityId: tripId,
        meta: { rating, productRating },
      },
    });

    const joined = await tx.trip.findUnique({
      where: { id: tripId },
      include: tripInclude,
    });
    return mapTrip(joined);
  });
},

async confirmTripDelivery(tripId, customerId) {
  return withTransaction(async (tx) => {
    const trip = await tx.trip.findUnique({ where: { id: tripId } });
    if (!trip) return null;
    if (trip.customerId !== customerId) {
      const error = new Error("Not allowed to confirm this delivery");
      error.status = 403;
      throw error;
    }
    if (tripStatusToApi(trip.status) !== "Delivered") {
      const error = new Error("Only delivered trips can be confirmed");
      error.status = 400;
      throw error;
    }
    if (!trip.deliveryProofUrl) {
      const error = new Error("Proof of delivery must be uploaded before customer confirmation");
      error.status = 400;
      throw error;
    }
    const updated = await tx.trip.update({ where: { id: tripId }, data: { deliveryConfirmedAt: new Date() } });
    await tx.notification.create({
      data: {
        userId: customerId,
        type: "delivery.confirmed",
        message: formatNotifyLines("Gaarsiinta waa la xaqiijiyay", {
          tripId,
          status: "Delivered",
          pickup: trip.pickup,
          destination: trip.destination,
          body: "Lacagta oo dhan (100%) hadda waa la bixinayaa.",
        }),
      },
    });
    await tx.auditLog.create({
      data: auditFields({ userId: customerId, action: "trip.delivery.confirmed", entityType: "trips", entityId: tripId, description: `Delivery confirmed for trip ${tripId}`, meta: {} }),
    });
    return mapTrip(updated);
  });
},

async listTripFeedback({ driverId, dispatcherId, customerId, complaintsOnly = false, page = 1, limit = 20 } = {}) {
  const where = {};
  if (driverId) where.driverId = driverId;
  if (customerId) where.customerId = customerId;
  if (dispatcherId) where.trip = { dispatcherId };
  if (complaintsOnly) where.reportProblem = true;

  const offset = (Number(page) - 1) * Number(limit);
  const [data, total, aggregates] = await Promise.all([
    prisma.tripFeedback.findMany({
      where,
      include: feedbackListInclude,
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: offset,
    }),
    prisma.tripFeedback.count({ where }),
    prisma.tripFeedback.aggregate({
      where,
      _avg: { rating: true, productRating: true, driverBehaviourRating: true, deliverySpeedRating: true, cargoConditionRating: true },
      _count: { _all: true },
    }),
  ]);

  return {
    data: data.map(mapFeedbackListItem),
    total,
    page: Number(page),
    summary: {
      count: aggregates._count._all,
      avgRating: aggregates._avg.rating ? Number(aggregates._avg.rating.toFixed(1)) : null,
      avgProductRating: aggregates._avg.productRating
        ? Number(aggregates._avg.productRating.toFixed(1))
        : null,
      avgDriverBehaviour: aggregates._avg.driverBehaviourRating ? Number(aggregates._avg.driverBehaviourRating.toFixed(1)) : null,
      avgDeliverySpeed: aggregates._avg.deliverySpeedRating ? Number(aggregates._avg.deliverySpeedRating.toFixed(1)) : null,
      avgCargoCondition: aggregates._avg.cargoConditionRating ? Number(aggregates._avg.cargoConditionRating.toFixed(1)) : null,
    },
  };
},

async rejectTrip(id, driverId) {
  return withTransaction(async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id, driverId },
      include: {
        driver: { select: { id: true, name: true } },
        truck: { select: { id: true, truckNumber: true, plateNumber: true, truckType: true } },
        cargoRequest: {
          include: { sharedBooking: true },
        },
      },
    });
    if (!trip) return null;

    if (tripStatusToApi(trip.status) !== "Assigned") {
      const error = new Error("You can only reject a trip while it is Assigned");
      error.status = 400;
      throw error;
    }

    await tx.trip.update({
      where: { id },
      data: { status: "Cancelled" },
    });

    if (trip.cargoRequestId) {
      await tx.cargoRequest.update({
        where: { id: trip.cargoRequestId },
        data: {
          status: "Pending",
          driverId: null,
          truckId: null,
          ...(trip.cargoRequest?.bookingChannel === "PHONE_ASSISTED"
            ? { assignedByAdminId: null, assignedAt: null }
            : {}),
        },
      });
      const sharedBooking = trip.cargoRequest?.sharedBooking;
      if (sharedBooking) {
        await tx.sharedTrip.update({
          where: { id: sharedBooking.sharedTripId },
          data: {
            availableTons: { increment: sharedBooking.weightTons },
            status: "Open for booking",
          },
        });
        await tx.sharedTripBooking.delete({ where: { id: sharedBooking.id } });
      }
    }

    if (trip.truckId) {
      await tx.truck.update({
        where: { id: trip.truckId },
        data: { status: "Available" },
      });
    }

    const driverName = trip.driver?.name || "Darawal";
    const truckLabel =
      trip.truck?.truckNumber ||
      trip.truck?.plateNumber ||
      trip.truckId ||
      "—";
    const rejectMessage = formatNotifyLines("Darawalku wuu diiday safarka", {
      tripId: id,
      bookingId: trip.cargoRequestId || undefined,
      status: "Cancelled",
      customerName: trip.cargoRequest?.senderName || trip.cargoRequest?.receiverName || null,
      driverName,
      truckType: trip.truck?.truckType || null,
      plateNumber: trip.truck?.plateNumber || null,
      truckNumber: trip.truck?.truckNumber || null,
      pickup: trip.pickup || trip.cargoRequest?.pickup,
      destination: trip.destination || trip.cargoRequest?.destination,
      fromRegion: trip.cargoRequest?.fromRegion,
      fromDistrict: trip.cargoRequest?.fromDistrict,
      toRegion: trip.cargoRequest?.toRegion,
      toDistrict: trip.cargoRequest?.toDistrict,
      body: `Darawal ${driverName} (gaari ${truckLabel}) ayaa diiday. Dib ayaa loogu qoondayn karaa.`,
    });

    const notifyIds = new Set(
      [trip.customerId, trip.dispatcherId].filter(Boolean).map(String)
    );
    let notification = null;
    for (const userId of notifyIds) {
      notification = await tx.notification.create({
        data: {
          userId,
          type: "trip.rejected",
          message: rejectMessage,
        },
      });
    }

    return { id, status: "Cancelled", notification: notification ? mapNotification(notification) : null };
  });
},

/** Driver lightly adjusts fare / ETA on an Assigned trip before accepting. */
async adjustAssignedTrip(id, driverId, { fare, estimatedTime, notes } = {}) {
  return withTransaction(async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id, driverId },
      include: {
        cargoRequest: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!trip) return null;

    if (tripStatusToApi(trip.status) !== "Assigned") {
      const error = new Error("You can only edit price/ETA while the trip is Assigned");
      error.status = 400;
      throw error;
    }

    const payment = trip.payments?.[0] || null;
    const paid = Number(payment?.amountPaid || 0);
    const nextFare = fare != null ? Number(fare) : Number(trip.fare);
    if (!Number.isFinite(nextFare) || nextFare <= 0) {
      const error = new Error("Enter a valid fare");
      error.status = 400;
      throw error;
    }

    if (paid > 0 && Math.abs(nextFare - Number(trip.fare)) > 0.009) {
      const error = new Error("Customer already paid toward this trip — fare can no longer be changed");
      error.status = 409;
      throw error;
    }

    const eta = estimatedTime != null ? String(estimatedTime).trim() : trip.estimatedTime;
    if (!eta) {
      const error = new Error("Estimated time is required");
      error.status = 400;
      throw error;
    }

    await tx.trip.update({
      where: { id },
      data: {
        fare: nextFare,
        estimatedTime: eta,
      },
    });

    if (trip.cargoRequestId) {
      await tx.cargoRequest.update({
        where: { id: trip.cargoRequestId },
        data: {
          quotedPrice: nextFare,
          finalPrice: nextFare,
          quotedEstimatedTime: eta,
          ...(notes !== undefined
            ? { quoteNotes: notes ? String(notes).trim() : null }
            : {}),
          quotedAt: new Date(),
          quoteVersion: { increment: 1 },
        },
      });
    }

    if (payment && paid <= 0) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { amount: nextFare },
      });
    }

    if (trip.customerId) {
      await tx.notification.create({
        data: {
          userId: trip.customerId,
          type: "trip.offer.updated",
          message: `${id} updated: ${nextFare} · ${eta}`,
        },
      });
    }

    const joined = await tx.trip.findUnique({
      where: { id },
      include: tripInclude,
    });
    return mapTrip(joined);
  });
},

async restoreTrip(id, actorId) {
  return withTransaction(async (tx) => {
    const existing = await tx.trip.findUnique({ where: { id } });
    if (!existing) return null;

    if (tripStatusToApi(existing.status) !== "Cancelled") {
      const error = new Error("Only cancelled trips can be restored");
      error.status = 400;
      throw error;
    }

    const truck = existing.truckId
      ? await tx.truck.findUnique({ where: { id: existing.truckId } })
      : null;

    if (truck && truck.status !== "Available") {
      const error = new Error("The truck of this trip is no longer available. Assign the request to another truck.");
      error.status = 400;
      throw error;
    }

    // The driver has to accept again, so a restored trip goes back to Assigned.
    const status = existing.driverId && truck ? "Assigned" : "Pending";

    await tx.trip.update({
      where: { id },
      data: { status: tripStatusToDb(status) },
    });

    if (existing.cargoRequestId) {
      await tx.cargoRequest.update({
        where: { id: existing.cargoRequestId },
        data: {
          status: reqStatusToDb(status === "Assigned" ? "Assigned" : "Approved"),
          driverId: status === "Assigned" ? existing.driverId : null,
          truckId: status === "Assigned" ? existing.truckId : null,
        },
      });
    }

    if (truck && status === "Assigned") {
      await tx.truck.update({
        where: { id: truck.id },
        data: { status: "Busy" },
      });
    }

    const notification = await tx.notification.create({
      data: {
        userId: existing.customerId,
        type: "trip.restored",
        message: `${id} restored to ${status}`,
      },
    });

    if (status === "Assigned" && existing.driverId) {
      await tx.notification.create({
        data: {
          userId: existing.driverId,
          type: "driver.assigned",
          message: `${id} restored and assigned to you again`,
        },
      });
    }

    await tx.auditLog.create({
      data: auditFields({
        userId: actorId,
        action: "trip.restored",
        entityType: "trips",
        entityId: id,
        description: `Trip ${id} restored`,
        oldValues: { status: "Cancelled" },
        newValues: { status },
      }),
    });

    const joined = await tx.trip.findUnique({
      where: { id },
      include: tripInclude,
    });

    return { trip: mapTrip(joined), notification: mapNotification(notification) };
  });
},

async listPublicTestimonials({ limit = 12 } = {}) {
  const rows = await prisma.tripFeedback.findMany({
    where: {
      reportProblem: false,
      rating: { gte: 4 },
    },
    include: {
      customer: { include: { customerProfile: true } },
      trip: { select: { pickup: true, destination: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Number(limit),
  });

  return {
    data: rows.map((row) => {
      const name = row.customer?.name?.trim() || "Customer";
      const parts = name.split(/\s+/).filter(Boolean);
      const displayName =
        parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0] || "Customer";
      return {
        id: row.id,
        rating: row.rating,
        comment:
          row.comment?.trim() ||
          `Rated ${row.rating}/5 stars for a smooth delivery experience.`,
        customerName: displayName,
        customerCity: row.customer?.customerProfile?.city || null,
        route: row.trip ? `${row.trip.pickup} → ${row.trip.destination}` : null,
        createdAt: row.createdAt,
      };
    }),
  };
},

};
