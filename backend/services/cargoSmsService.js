import { prisma } from "../lib/prisma.js";
import { queueSms } from "./smsService.js";
import {
  TRIP_NOTIFY,
  customerMessageForTripStatus,
  deliveryConfirmCode,
  formatCustomerNotifyLine,
} from "../lib/tripCustomerMessages.js";

const publicUrl = () =>
  (process.env.APP_PUBLIC_URL || process.env.CLIENT_ORIGIN?.split(",")[0] || "http://localhost:5173").replace(
    /\/$/,
    ""
  );

const safeLocation = (cargo, prefix) => {
  const region = cargo?.[`${prefix}Region`];
  const district = cargo?.[`${prefix}District`];
  const neighborhood = cargo?.[`${prefix}Neighborhood`];
  return [neighborhood, district, region].filter(Boolean).join(", ")
    || (prefix === "from" ? cargo?.pickup : cargo?.destination)
    || (prefix === "from" ? "Pickup area" : "Destination area");
};

function uniqueByPhone(parties) {
  return parties.filter((party, index, list) =>
    party.phone && list.findIndex((row) => row.phone === party.phone) === index
  );
}

/** External parties who may not have a GaariHel account. */
export function cargoSmsRecipients(cargo, { prefer } = {}) {
  const rows = uniqueByPhone([
    { name: cargo?.senderName || cargo?.sender, phone: cargo?.senderPhone, type: "Sender" },
    { name: cargo?.receiverName || cargo?.receiver, phone: cargo?.receiverPhone, type: "Receiver" },
  ]);

  if (prefer === "Receiver") return rows.filter((row) => row.type === "Receiver");
  if (prefer === "Sender") return rows.filter((row) => row.type === "Sender");
  if (prefer === "external") {
    if (cargo?.customerRole === "SENDER") return rows.filter((row) => row.type === "Receiver");
    if (cargo?.customerRole === "RECEIVER") return rows.filter((row) => row.type === "Sender");
  }
  return rows;
}

/** Booking parties + registered customer phone. */
export async function resolveCargoSmsRecipients(cargo) {
  const parties = [...cargoSmsRecipients(cargo)];
  const customerId = cargo?.customerId;
  if (!customerId) return parties;

  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: { name: true, phone: true },
  });
  if (customer?.phone) {
    parties.push({ name: customer.name || "Macmiil", phone: customer.phone, type: "Customer" });
  }
  return uniqueByPhone(parties);
}

export function formatAssignedTruckLine({ driverName, truckType, truckNumber, plateNumber } = {}) {
  const driver = String(driverName || "").trim() || "Darawal";
  const type = truckType || "Gaari";
  const plate = plateNumber || truckNumber || null;
  const number = truckNumber && truckNumber !== plate ? truckNumber : null;
  const parts = [`Darawalka: ${driver}`];
  if (type) parts.push(`Nooca gaariga: ${type}`);
  if (plate) parts.push(`Taargada: ${plate}`);
  if (number) parts.push(`Gaari: ${number}`);
  return ` ${parts.join(". ")}.`;
}

async function loadAssignedTruckDetails(request) {
  const truckId = request.truckId;
  const driverId = request.driverId;
  if (!truckId && !driverId) return null;

  const [truck, driver] = await Promise.all([
    truckId
      ? prisma.truck.findUnique({
          where: { id: truckId },
          select: { truckType: true, truckNumber: true, plateNumber: true },
        })
      : null,
    driverId
      ? prisma.user.findUnique({
          where: { id: driverId },
          select: {
            name: true,
            truck: { select: { truckType: true, truckNumber: true, plateNumber: true } },
          },
        })
      : null,
  ]);

  const source = truck || driver?.truck;
  if (!source && !driver) return null;

  return {
    driverName: driver?.name || null,
    truckType: source?.truckType || request.truckType || null,
    truckNumber: source?.truckNumber || null,
    plateNumber: source?.plateNumber || null,
  };
}

async function sendMany(cargo, entityType, entityId, event, messageFor, recipients) {
  const list = recipients || (await resolveCargoSmsRecipients(cargo));
  return Promise.all(
    list.map((party) =>
      queueSms({
        entityType,
        entityId,
        event,
        recipientName: party.name,
        recipientPhone: party.phone,
        message: messageFor(party),
      })
    )
  );
}

function greet(party) {
  return `Salaan ${party.name || party.type || "Macmiil"},`;
}

export async function sendBookingCreatedSms(request) {
  const recipients = await resolveCargoSmsRecipients(request);
  const msg = TRIP_NOTIFY.bookingCreated;
  return sendMany(
    request,
    "cargo_request",
    request.id,
    "booking.created",
    (party) =>
      `${greet(party)} ${msg.title}. ${msg.body} Booking ${request.id}. Ka: ${safeLocation(request, "from")} → ${safeLocation(request, "to")}.`,
    recipients
  );
}

export async function sendCargoRequestEventSms(request, event) {
  const recipients = await resolveCargoSmsRecipients(request);
  const truckDetails =
    event === "booking.assigned" || event === "booking.accepted"
      ? await loadAssignedTruckDetails(request)
      : null;
  const truckLine = truckDetails ? formatAssignedTruckLine(truckDetails) : "";

  const assigned = TRIP_NOTIFY.assigned;
  const labels = {
    "booking.accepted": `${assigned.title}. ${assigned.body} Lacagta (100%) waxaa la bixinayaa Delivered ka dib.`,
    "booking.assigned": `${assigned.title}. ${assigned.body} Lacagta (100%) waxaa la bixinayaa Delivered ka dib.${truckLine}`,
    "booking.cancelled": `qaadista xamuulka ${request.id} waa la joojiyay.`,
    "booking.restored": `qaadista xamuulka ${request.id} dib ayaa loo soo cusbooneysiiyay.`,
  };

  return sendMany(
    request,
    "cargo_request",
    request.id,
    event,
    (party) =>
      `${greet(party)} ${labels[event] || "Xaaladda xamuulkaaga waa la cusboonaysiiyay."} Booking ${request.id}. Ka: ${safeLocation(request, "from")} → ${safeLocation(request, "to")}.`,
    recipients
  );
}

export async function sendTripEventSms(tripId, event, { feedbackToken } = {}) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      cargoRequest: true,
      driver: { select: { name: true, phone: true } },
      truck: { select: { truckType: true, truckNumber: true, plateNumber: true } },
    },
  });
  if (!trip?.cargoRequest) return [];

  const cargo = trip.cargoRequest;
  const list = await resolveCargoSmsRecipients(cargo);
  const driverName = trip.driver?.name?.split(/\s+/)[0] || "Darawal";
  const truckLine = formatAssignedTruckLine({
    driverName,
    truckType: trip.truck?.truckType || cargo.truckType,
    truckNumber: trip.truck?.truckNumber,
    plateNumber: trip.truck?.plateNumber,
  });
  const code = deliveryConfirmCode(trip.id);

  if (event === "cargo.delivered") {
    const feedbackLink = feedbackToken
      ? `${publicUrl()}/f/${feedbackToken}`
      : `${publicUrl()}/feedback`;
    const delivered = TRIP_NOTIFY.delivered;
    return sendMany(
      cargo,
      "trip",
      trip.id,
      event,
      (party) =>
        `${greet(party)} ${delivered.title}. ${delivered.body} Trip ${trip.id}. Feedback: ${feedbackLink}`,
      list
    );
  }

  if (event === "cargo.picked_up") {
    const weight = cargo.weight && !/^(tbd|pending|n\/a)$/i.test(String(cargo.weight).trim())
      ? ` Culeyska: ${cargo.weight}.`
      : "";
    const entry = customerMessageForTripStatus("Picked Up", { tripId: trip.id });
    return sendMany(
      cargo,
      "trip",
      trip.id,
      event,
      (party) => `${greet(party)} ${entry.title}. ${entry.body}${weight}${truckLine} Trip ${trip.id}.`,
      list
    );
  }

  const statusByEvent = {
    "cargo.en_route_pickup": "En Route to Pickup",
    "cargo.arrived_pickup": "Arrived at Pickup",
    "cargo.picked_up": "Picked Up",
    "cargo.in_transit": "In Transit",
    "cargo.near_destination": "Near Destination",
  };

  const status = statusByEvent[event];
  const entry = status ? customerMessageForTripStatus(status, { tripId: trip.id }) : null;

  const fallback = {
    "cargo.cancelled": `qaadista xamuulka ${trip.id} waa la joojiyay.`,
    "cargo.restored": `qaadista xamuulka ${trip.id} waa dib loo soo celiyay.`,
  };

  return sendMany(
    cargo,
    "trip",
    trip.id,
    event,
    (party) => {
      if (entry) {
        const extra =
          event === "cargo.near_destination"
            ? ` Koodhka xaqiijinta: ${code}. Sii darawalka ${driverName}.${truckLine}`
            : truckLine;
        return `${greet(party)} ${entry.title}. ${entry.body}${extra} Trip ${trip.id}.`;
      }
      return `${greet(party)} ${fallback[event] || "Xaaladda xamuulkaaga waa la cusboonaysiiyay."}`;
    },
    list
  );
}

export { formatCustomerNotifyLine, TRIP_NOTIFY, customerMessageForTripStatus, deliveryConfirmCode };
