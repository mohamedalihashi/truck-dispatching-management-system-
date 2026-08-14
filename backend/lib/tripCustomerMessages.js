/** Customer-facing trip timeline copy (Somali). Used for SMS + in-app notifications. */

export const TRIP_NOTIFY = {
  bookingCreated: {
    title: "Dalabka La Helay",
    body:
      "Soo dhawoow macmiil. Dalabkaaga waan helnay, waxaana kuugu adeegaynaa sida ugu dhaqsiyaha badan. Waxaan ku soo ogeysiin doonaa marka gaari laguu qoondeeyo.",
  },
  assigned: {
    title: "Gaari La Qoondeeyay",
    body:
      "Gaari ayaa laguu qoondeeyay. Darawalkaaga ayaa diyaar u ah inuu usoo dhaqaaqo goobta xamuulka laga qaadayo, waxaana kuu soo gaari doona sida ugu dhaqsiyaha badan.",
  },
  enRoutePickup: {
    title: "Darawalka Wuu Kusoo Socdaa",
    body:
      "Darawalkaagu hadda wuxuu kusoo socdaa goobta xamuulka laga qaadayo. Fadlan diyaarso xamuulkaaga.",
  },
  arrivedPickup: {
    title: "Darawalka Wuu Soo Gaaray",
    body:
      "Darawalkaagu wuxuu soo gaaray goobta xamuulka laga qaadayo. Fadlan diyaar u noqo wareejinta xamuulka.",
  },
  pickedUp: {
    title: "Xamuulka La Qaaday",
    body:
      "Xamuulkaaga waa la qaaday, safarkuna wuu bilowday. Waxaad nidaamka kala socon kartaa halka uu marayo.",
  },
  inTransit: {
    title: "Safarka Ku Jira",
    body:
      "Xamuulkaaga hadda safarka ayuu ku jiraa, wuxuuna kusoo socdaa goobta loo waday.",
  },
  nearDestination: {
    title: "Ku Dhow Goobta",
    body:
      "Xamuulkaaga wuxuu ku dhow yahay goobta loo waday. Fadlan isu diyaari inaad la wareegto. Marka alaabta laguu keeno, sii darawalka koodhka xaqiijinta si loo xaqiijiyo Delivered.",
  },
  delivered: {
    title: "La Gaarsiiyay",
    body:
      "Xamuulkaaga si guul leh ayaa loo gaarsiiyay goobtii loo waday. Waad ku mahadsan tahay isticmaalka adeeggeenna. Fadlan bixi lacagta oo dhan (100%).",
  },
};

/** Stable 6-digit confirm code for Near Destination / Delivered handoff. */
export function deliveryConfirmCode(tripId) {
  let hash = 2166136261;
  for (const ch of String(tripId || "")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return String(100000 + (Math.abs(hash) % 900000));
}

export function customerMessageForTripStatus(status, { tripId } = {}) {
  const code = tripId ? deliveryConfirmCode(tripId) : null;
  switch (status) {
    case "Assigned":
      return TRIP_NOTIFY.assigned;
    case "En Route to Pickup":
      return TRIP_NOTIFY.enRoutePickup;
    case "Arrived at Pickup":
      return TRIP_NOTIFY.arrivedPickup;
    case "Picked Up":
      return TRIP_NOTIFY.pickedUp;
    case "In Transit":
      return TRIP_NOTIFY.inTransit;
    case "Near Destination": {
      const base = TRIP_NOTIFY.nearDestination;
      return {
        title: base.title,
        body: code
          ? `${base.body} Koodhkaaga: ${code}.`
          : base.body,
      };
    }
    case "Delivered":
      return TRIP_NOTIFY.delivered;
    default:
      return null;
  }
}

/** Prefer full address string, else region + district. */
export function formatRouteAddress({ pickup, destination, fromRegion, fromDistrict, toRegion, toDistrict } = {}) {
  const from =
    (pickup && String(pickup).trim()) ||
    [fromRegion, fromDistrict].filter(Boolean).join(", ") ||
    null;
  const to =
    (destination && String(destination).trim()) ||
    [toRegion, toDistrict].filter(Boolean).join(", ") ||
    null;
  return { pickup: from, destination: to };
}

/**
 * Build a full in-app notification so the user can follow name + addresses + status.
 */
export function formatCustomerNotifyLine(
  entry,
  {
    tripId,
    bookingId,
    status,
    customerName,
    driverName,
    truckType,
    plateNumber,
    truckNumber,
    pickup,
    destination,
    fromRegion,
    fromDistrict,
    toRegion,
    toDistrict,
    extra,
  } = {}
) {
  if (!entry) return null;
  const ref = tripId || bookingId;
  const lines = [entry.title + (ref ? ` (${ref})` : "")];
  const route = formatRouteAddress({
    pickup,
    destination,
    fromRegion,
    fromDistrict,
    toRegion,
    toDistrict,
  });

  if (status) lines.push(`Xaalad: ${status}`);
  if (customerName) lines.push(`Macmiil: ${customerName}`);
  if (driverName) lines.push(`Darawal: ${driverName}`);
  if (truckType) lines.push(`Nooca gaariga: ${truckType}`);
  if (plateNumber) lines.push(`Taargada: ${plateNumber}`);
  else if (truckNumber) lines.push(`Gaari: ${truckNumber}`);
  if (route.pickup || route.destination) {
    lines.push(`Jidka: ${route.pickup || "—"} → ${route.destination || "—"}`);
  }
  if (entry.body) lines.push(entry.body);
  if (extra) lines.push(String(extra));

  return lines.join("\n");
}

/** Free-form multi-line notification (driver / admin / one-off events). */
export function formatNotifyLines(title, details = {}) {
  const {
    tripId,
    bookingId,
    status,
    customerName,
    driverName,
    truckType,
    plateNumber,
    truckNumber,
    pickup,
    destination,
    fromRegion,
    fromDistrict,
    toRegion,
    toDistrict,
    body,
    extra,
  } = details;
  const ref = tripId || bookingId;
  const lines = [String(title) + (ref ? ` (${ref})` : "")];
  const route = formatRouteAddress({
    pickup,
    destination,
    fromRegion,
    fromDistrict,
    toRegion,
    toDistrict,
  });

  if (status) lines.push(`Xaalad: ${status}`);
  if (customerName) lines.push(`Macmiil: ${customerName}`);
  if (driverName) lines.push(`Darawal: ${driverName}`);
  if (truckType) lines.push(`Nooca gaariga: ${truckType}`);
  if (plateNumber) lines.push(`Taargada: ${plateNumber}`);
  else if (truckNumber) lines.push(`Gaari: ${truckNumber}`);
  if (route.pickup || route.destination) {
    lines.push(`Jidka: ${route.pickup || "—"} → ${route.destination || "—"}`);
  }
  if (body) lines.push(String(body));
  if (extra) lines.push(String(extra));
  return lines.join("\n");
}

/** Ordered steps for customer trip progress UI. */
export const CUSTOMER_TRIP_STEPS = [
  { key: "Pending", status: "Pending", ...TRIP_NOTIFY.bookingCreated },
  { key: "Assigned", status: "Assigned", ...TRIP_NOTIFY.assigned },
  { key: "En Route to Pickup", status: "En Route to Pickup", ...TRIP_NOTIFY.enRoutePickup },
  { key: "Arrived at Pickup", status: "Arrived at Pickup", ...TRIP_NOTIFY.arrivedPickup },
  { key: "Picked Up", status: "Picked Up", ...TRIP_NOTIFY.pickedUp },
  { key: "In Transit", status: "In Transit", ...TRIP_NOTIFY.inTransit },
  { key: "Near Destination", status: "Near Destination", ...TRIP_NOTIFY.nearDestination },
  { key: "Delivered", status: "Delivered", ...TRIP_NOTIFY.delivered },
];
