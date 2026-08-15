import { deliveryConfirmCode } from "../../lib/tripCustomerMessages.js";
import { resolveLocationCoords } from "../../lib/somaliaGeo.js";
import { tripProgress } from "../../lib/fleetTracking.js";

// Prisma enum values use underscores; the API uses spaces.
export const tripStatusToDb = (s) => (s ? s.replace(/ /g, "_") : s);
export const tripStatusToApi = (s) => (s ? s.replace(/_/g, " ") : s);
export const reqStatusToDb = (s) => (s ? s.replace(/ /g, "_") : s);
export const reqStatusToApi = (s) => (s ? s.replace(/_/g, " ") : s);

const CUSTOMER_STATUS_LABELS = {
  Pending: "Waiting for Driver",
  Assigned: "Driver Assigned",
  "En Route to Pickup": "Driver On The Way",
  "Arrived at Pickup": "Driver Arrived",
  "Picked Up": "Trip Started",
  "In Transit": "In Transit",
  "Near Destination": "Near Destination",
  Delivered: "Trip Completed",
  Cancelled: "Cancelled",
};

export function mapCustomerStatus(status) {
  return CUSTOMER_STATUS_LABELS[status] || status;
}

function parseDistanceKm(distance) {
  if (distance == null) return null;
  const n = Number(String(distance).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function computeTripProgress(row) {
  if (!row) return null;
  const destinationPoint = resolveLocationCoords({
    text: row.destination,
    district: row.cargoRequest?.toDistrict,
    region: row.cargoRequest?.toRegion,
  });
  return tripProgress({
    plannedDistanceKm: parseDistanceKm(row.distance),
    completedDistanceKm: row.distanceTraveledKm != null ? Number(row.distanceTraveledKm) : 0,
    currentLat: row.lastLat,
    currentLng: row.lastLng,
    destinationLat: destinationPoint.lat,
    destinationLng: destinationPoint.lng,
    speedKmh: row.lastSpeedKmh,
  });
}

export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username || null,
    email: row.email,
    role: row.role,
    isSuperAdmin: Boolean(row.isSuperAdmin),
    phone: row.phone,
    avatarUrl: row.avatarUrl || null,
    avatarPublicId: row.avatarPublicId || null,
    nationalIdNumber: row.nationalIdNumber || null,
    driverLicense: row.driverLicense || null,
    driverLicenseUrl: row.driverLicenseUrl || null,
    driverLicensePublicId: row.driverLicensePublicId || null,
    driverImageUrl: row.driverImageUrl || null,
    driverImagePublicId: row.driverImagePublicId || null,
    serviceType: row.serviceType || null,
    status: row.status,
    mustChangePassword: Boolean(row.mustChangePassword),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    truckId: row.truck?.id || null,
    truckNumber: row.truck?.truckNumber || null,
    plateNumber: row.truck?.plateNumber || null,
    truckType: row.truck?.truckType || null,
    capacity: row.truck?.capacity || null,
    truckStatus: row.truck?.status || null,
    truckPhotoUrl1: row.truck?.photoUrl1 || null,
    truckPhotoUrl2: row.truck?.photoUrl2 || null,
    truckDocumentUrls: row.truck?.documentUrls || [],
    region: row.truck?.region || null,
    city: row.truck?.city || null,
    customerProfile: row.customerProfile || null,
  };
}

export function mapTruck(row) {
  if (!row) return null;
  return {
    id: row.id,
    truckNumber: row.truckNumber,
    plateNumber: row.plateNumber,
    capacity: row.capacity,
    capacityTons: row.capacityTons != null ? Number(row.capacityTons) : null,
    type: row.truckType,
    truckType: row.truckType,
    driverId: row.driverId,
    driver: row.driver?.name || null,
    driverPhone: row.driver?.phone || null,
    driverServiceType: row.driver?.serviceType || null,
    status: row.status,
    photoUrl1: row.photoUrl1 || null,
    photoUrl2: row.photoUrl2 || null,
    documentUrls: row.documentUrls || [],
    registrationDocumentUrl: row.registrationDocumentUrl || null,
    region: row.region || null,
    city: row.city || null,
    lastLocation:
      row.lastLat != null && row.lastLng != null
        ? {
            lat: row.lastLat,
            lng: row.lastLng,
            updatedAt: row.lastLocationAt,
            speedKmh: row.lastSpeedKmh != null ? Number(row.lastSpeedKmh) : null,
            heading: row.lastHeading != null ? Number(row.lastHeading) : null,
          }
        : null,
    gpsStatus: row.gpsStatus || "OFFLINE",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapCargoRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customerId,
    customer:
      row.bookingChannel === "PHONE_ASSISTED"
        ? (row.senderName || row.sender || row.customer?.name || null)
        : (row.customer?.name || null),
    pickup: row.pickup,
    destination: row.destination,
    from: row.pickup,
    to: row.destination,
    truckType: row.truckType,
    cargoType: row.cargoType || null,
    measuredQuantity: row.measuredQuantity != null ? Number(row.measuredQuantity) : null,
    measurementUnit: row.measurementUnit || null,
    weight: row.weight,
    description: row.description,
    cargo: row.description,
    receiver: row.receiver,
    sender: row.sender,
    customerRole: row.customerRole,
    senderName: row.senderName || row.sender || null,
    senderPhone: row.senderPhone,
    receiverName: row.receiverName || row.receiver || null,
    receiverPhone: row.receiverPhone,
    fromRegion: row.fromRegion,
    fromDistrict: row.fromDistrict,
    fromNeighborhood: row.fromNeighborhood,
    toRegion: row.toRegion,
    toDistrict: row.toDistrict,
    toNeighborhood: row.toNeighborhood,
    specialInstructions: row.specialInstructions,
    preferredPickupDate: row.preferredPickupDate,
    distanceKm: row.distanceKm != null ? Number(row.distanceKm) : null,
    calculatedPrice: row.calculatedPrice != null ? Number(row.calculatedPrice) : null,
    adjustmentType: row.adjustmentType || null,
    adjustmentAmount: row.adjustmentAmount != null ? Number(row.adjustmentAmount) : null,
    adjustmentReason: row.adjustmentReason || null,
    finalPrice: row.finalPrice != null ? Number(row.finalPrice) : (row.quotedPrice != null ? Number(row.quotedPrice) : null),
    approvedByDispatcher: row.approvedByDispatcher || null,
    approvedAt: row.approvedAt || null,
    quotedPrice: row.quotedPrice != null ? Number(row.quotedPrice) : null,
    quotedEstimatedTime: row.quotedEstimatedTime,
    quoteNotes: row.quoteNotes,
    quotedAt: row.quotedAt,
    quoteVersion: row.quoteVersion ?? 0,
    customerDecisionAt: row.customerDecisionAt,
    customerDecisionNote: row.customerDecisionNote,
    cargoImageUrl: row.cargoImageUrl || null,
    cargoImagePublicId: row.cargoImagePublicId || null,
    loadType: row.loadType || "FTL",
    status:
      row.bookingChannel === "PHONE_ASSISTED"
        ? (reqStatusToApi(row.status) === "Pending"
            ? "NOT_ASSIGNED"
            : reqStatusToApi(row.status).toUpperCase().replace(/ /g, "_"))
        : reqStatusToApi(row.status),
    bookingChannel: row.bookingChannel || "ONLINE",
    assignedByAdminId: row.assignedByAdminId || null,
    assignedAt: row.assignedAt || null,
    driverId: row.driverId,
    driver: row.driver?.name || null,
    truckId: row.truckId,
    truck: row.truck?.truckNumber || null,
    dispatcherId: row.dispatcherId,
    dispatcher: row.dispatcher?.name || null,
    date: row.createdAt
      ? new Date(row.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapFeedback(row) {
  if (!row) return null;
  return {
    id: row.id,
    tripId: row.tripId,
    customerId: row.customerId,
    driverId: row.driverId,
    rating: row.rating,
    productRating: row.productRating,
    driverBehaviourRating: row.driverBehaviourRating,
    deliverySpeedRating: row.deliverySpeedRating,
    cargoConditionRating: row.cargoConditionRating,
    cargoReceivedSafely: row.cargoReceivedSafely,
    reportProblem: row.reportProblem,
    complaintStatus: row.complaintStatus,
    senderName: row.senderName,
    receiverName: row.receiverName,
    comment: row.comment,
    createdAt: row.createdAt,
  };
}

export function mapTrip(row) {
  if (!row) return null;
  return {
    id: row.id,
    cargoRequestId: row.cargoRequestId,
    customerId: row.customerId,
    customer:
      row.cargoRequest?.bookingChannel === "PHONE_ASSISTED"
        ? (row.cargoRequest?.senderName || row.cargoRequest?.sender || row.customer?.name || null)
        : (row.customer?.name || null),
    driverId: row.driverId,
    driver: row.driver?.name || null,
    dispatcherId: row.dispatcherId,
    dispatcher: row.dispatcher?.name || null,
    truckId: row.truckId,
    truck: row.truck?.truckNumber || null,
    plateNumber: row.truck?.plateNumber || null,
    truckType: row.truck?.truckType || null,
    driverPhone: row.driver?.phone || null,
    pickup: row.pickup,
    destination: row.destination,
    route: `${row.pickup} -> ${row.destination}`,
    distance: row.distance,
    distanceTraveledKm:
      row.distanceTraveledKm != null ? Number(row.distanceTraveledKm) : null,
    lastLocation:
      row.lastLat != null && row.lastLng != null
        ? {
            lat: row.lastLat,
            lng: row.lastLng,
            updatedAt: row.lastLocationAt,
            speedKmh: row.lastSpeedKmh != null ? Number(row.lastSpeedKmh) : null,
            heading: row.lastHeading != null ? Number(row.lastHeading) : null,
            accuracyM: row.lastAccuracyM != null ? Number(row.lastAccuracyM) : null,
          }
        : null,
    estimatedTime: row.estimatedTime,
    eta: row.estimatedTime,
    status: tripStatusToApi(row.status),
    customerStatus: mapCustomerStatus(tripStatusToApi(row.status)),
    progress: computeTripProgress(row),
    fare: Number(row.fare || 0),
    deliveryConfirmCode: ["Near Destination", "Delivered"].includes(tripStatusToApi(row.status))
      ? deliveryConfirmCode(row.id)
      : null,
    cargo: row.cargoRequest?.description || "Cargo",
    cargoType: row.cargoRequest?.cargoType || null,
    cargoWeight: row.cargoRequest?.weight || null,
    measuredQuantity:
      row.cargoRequest?.measuredQuantity != null ? Number(row.cargoRequest.measuredQuantity) : null,
    measurementUnit: row.cargoRequest?.measurementUnit || null,
    cargoImageUrl: row.cargoRequest?.cargoImageUrl || null,
    loadType: row.cargoRequest?.loadType || "FTL",
    bookingChannel: row.cargoRequest?.bookingChannel || "ONLINE",
    customerRole: row.cargoRequest?.customerRole || null,
    senderName: row.cargoRequest?.senderName || row.cargoRequest?.sender || null,
    senderPhone: row.cargoRequest?.senderPhone || null,
    receiverName: row.cargoRequest?.receiverName || row.cargoRequest?.receiver || null,
    receiverPhone: row.cargoRequest?.receiverPhone || null,
    fromRegion: row.cargoRequest?.fromRegion || null,
    fromDistrict: row.cargoRequest?.fromDistrict || null,
    fromNeighborhood: row.cargoRequest?.fromNeighborhood || null,
    toRegion: row.cargoRequest?.toRegion || null,
    toDistrict: row.cargoRequest?.toDistrict || null,
    toNeighborhood: row.cargoRequest?.toNeighborhood || null,
    deliveryProofUrl: row.deliveryProofUrl,
    signatureUrl: row.signatureUrl,
    deliveryConfirmedAt: row.deliveryConfirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    feedback: row.feedback ? mapFeedback(row.feedback) : null,
  };
}

export function mapFeedbackListItem(row) {
  if (!row) return null;
  const trip = row.trip;
  return {
    ...mapFeedback(row),
    customer: row.customer?.name || trip?.customer?.name || null,
    driver: row.driver?.name || trip?.driver?.name || null,
    dispatcher: trip?.dispatcher?.name || null,
    route: trip ? `${trip.pickup} → ${trip.destination}` : null,
    pickup: trip?.pickup || null,
    destination: trip?.destination || null,
    cargo: trip?.cargoRequest?.description || null,
    tripStatus: trip ? tripStatusToApi(trip.status) : null,
  };
}

export function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    message: row.message,
    read: row.read,
    createdAt: row.createdAt,
  };
}

export const userInclude = { truck: true, customerProfile: true };

export const cargoRequestInclude = {
  customer: true,
  driver: true,
  dispatcher: true,
  assignedByAdmin: true,
  truck: true,
};

export const tripInclude = {
  customer: true,
  driver: true,
  dispatcher: true,
  truck: true,
  cargoRequest: true,
  feedback: true,
};

export const feedbackListInclude = {
  customer: true,
  driver: true,
  trip: {
    include: {
      customer: true,
      driver: true,
      dispatcher: true,
      cargoRequest: true,
    },
  },
};
