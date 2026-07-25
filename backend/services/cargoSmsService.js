import { prisma } from "../lib/prisma.js";
import { queueSms } from "./smsService.js";

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

/** External parties who may not have a TruckDispatch account. */
export function cargoSmsRecipients(cargo, { prefer } = {}) {
  const rows = [
    { name: cargo?.senderName || cargo?.sender, phone: cargo?.senderPhone, type: "Sender" },
    { name: cargo?.receiverName || cargo?.receiver, phone: cargo?.receiverPhone, type: "Receiver" },
  ].filter((party, index, list) =>
    party.phone && list.findIndex((row) => row.phone === party.phone) === index
  );

  if (prefer === "Receiver") return rows.filter((row) => row.type === "Receiver");
  if (prefer === "Sender") return rows.filter((row) => row.type === "Sender");
  if (prefer === "external") {
    // Customer booked as sender → notify receiver; booked as receiver → notify sender.
    if (cargo?.customerRole === "SENDER") return rows.filter((row) => row.type === "Receiver");
    if (cargo?.customerRole === "RECEIVER") return rows.filter((row) => row.type === "Sender");
  }
  return rows;
}

async function sendMany(cargo, entityType, entityId, event, messageFor, recipients) {
  const list = recipients || cargoSmsRecipients(cargo);
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

export async function sendBookingCreatedSms(request) {
  // Sender and receiver both get updates, so the booking customer is always included.
  const recipients = cargoSmsRecipients(request);
  const sender = request.senderName || "Diraha";
  const receiver = request.receiverName || "qaataha";
  return sendMany(
    request,
    "cargo_request",
    request.id,
    "booking.created",
    (party) =>
      party.type === "Receiver"
        ? `Salaan ${party.name || "Qaataha"}, ${sender} ayaa kuu ballansaday xamuul. Booking ${request.id}. Ka: ${safeLocation(request, "from")}. Ku: ${safeLocation(request, "to")}. Waxaad heli doontaa SMS markasta oo xaaladda isbeddesho.`
        : `Salaan ${party.name || "Diraha"}, ${receiver} ayaa codsaday in xamuul laga soo qaado. Booking ${request.id}. Ka: ${safeLocation(request, "from")}. Ku: ${safeLocation(request, "to")}. Waxaad heli doontaa SMS xaaladda.`,
    recipients
  );
}

export async function sendCargoRequestEventSms(request, event) {
  const fallback = cargoSmsRecipients(request);

  const labels = {
    "booking.accepted": "buukinka waa la aqbalay fadlan bixi lacagta 30%.",
    "booking.assigned": `Darawalkan ayaa loo qoondeeyay xamuulka ${request.id}. Fadlan bixi 30% deposit ka hor inta safarka uusan bilaaban.`,
    "booking.cancelled": `qaadista xamuulka   ${request.id} waa la joojiyay.`,
    "booking.restored": `qaadista  xamuulka ${request.id} dib ayaa loosoo cusbooneysiiyay .`,
  };

  let driverLine = "";
  if (event === "booking.assigned" && request.driverId) {
    const driver = await prisma.user.findUnique({
      where: { id: request.driverId },
      select: { name: true, phone: true },
    });
    if (driver?.phone) {
      driverLine = ` Darawalka: ${driver.name || "Darawal"}, tel: ${driver.phone}.`;
    }
  }

  return sendMany(
    request,
    "cargo_request",
    request.id,
    event,
    (party) =>
      `Salaan ${party.name || party.type}, ${labels[event] || "Xaaladda xamuulkaaga waa la cusboonaysiiyay."}${driverLine} Booking ${request.id}.`,
    fallback
  );
}

export async function sendTripEventSms(tripId, event, { feedbackToken } = {}) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      cargoRequest: true,
      driver: { select: { name: true, phone: true } },
    },
  });
  if (!trip?.cargoRequest) return [];

  const cargo = trip.cargoRequest;
  const list = cargoSmsRecipients(cargo);
  const driverName = trip.driver?.name?.split(/\s+/)[0] || "Darawal";
  const driverPhone = trip.driver?.phone || "";
  const driverContact = driverPhone ? ` Darawalka ${driverName}: ${driverPhone}.` : "";

  if (event === "cargo.delivered") {
    const feedbackLink = feedbackToken
      ? `${publicUrl()}/f/${feedbackToken}`
      : `${publicUrl()}/feedback`;
    // Receiver (and external party) get the short feedback link.
    return sendMany(
      cargo,
      "trip",
      trip.id,
      event,
      (party) =>
        party.type === "Receiver"
          ? `Salaan ${party.name || "Qaataha"}, xamuulka ${trip.id} waa la geeyay. Xaqiiji oo qiimee halkan: ${feedbackLink}`
          : `Salaan ${party.name || party.type}, xamuulka ${trip.id} waa la geeyay. Feedback: ${feedbackLink}`,
      list
    );
  }

  const text = {
    "cargo.arrived_pickup": `Darawalku wuxuu yimid goobta qaadista xamuulka ${trip.id}.${driverContact}`,
    "cargo.picked_up": `Xamuulka ${trip.id} waa la soo qaaday oo wuxuu ku socdaa ${safeLocation(cargo, "to")}.${driverContact}`,
    "cargo.in_transit": `Xamuulka ${trip.id} waa ku jiraa safarka oo ku socda ${safeLocation(cargo, "to")}.${driverContact}`,
    "cargo.near_destination": `Darawalku wuu usoo dhow yahay wax yar kadib wuu kusoo garaa  ${trip.id}.${driverContact}`,
    "cargo.cancelled": `qaadista xamuulka ${trip.id} waa la joojiyay.`,
    "cargo.restored": `qaadista xamuulka ${trip.id} waa dib loo soo celiyay.`,
  };

  return sendMany(
    cargo,
    "trip",
    trip.id,
    event,
    (party) => `Salaan ${party.name || party.type}, ${text[event] || "Xaaladda xamuulkaaga waa la cusboonaysiiyay."}`,
    list
  );
}
