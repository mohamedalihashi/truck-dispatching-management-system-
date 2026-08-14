/**
 * Customer trip progress copy (mirrors backend/lib/tripCustomerMessages.js).
 * Keep in sync when SMS/notification wording changes.
 */

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

export function deliveryConfirmCode(tripId) {
  let hash = 2166136261;
  for (const ch of String(tripId || "")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return String(100000 + (Math.abs(hash) % 900000));
}

export const CUSTOMER_TRIP_STEPS = [
  { status: "Pending", ...TRIP_NOTIFY.bookingCreated },
  { status: "Assigned", ...TRIP_NOTIFY.assigned },
  { status: "En Route to Pickup", ...TRIP_NOTIFY.enRoutePickup },
  { status: "Arrived at Pickup", ...TRIP_NOTIFY.arrivedPickup },
  { status: "Picked Up", ...TRIP_NOTIFY.pickedUp },
  { status: "In Transit", ...TRIP_NOTIFY.inTransit },
  { status: "Near Destination", ...TRIP_NOTIFY.nearDestination },
  { status: "Delivered", ...TRIP_NOTIFY.delivered },
];

export function stepIndexForStatus(status) {
  if (!status || status === "Cancelled") return -1;
  if (status === "Approved" || status === "Awaiting Approval" || status === "Quote Rejected") return 0;
  const idx = CUSTOMER_TRIP_STEPS.findIndex((step) => step.status === status);
  return idx;
}
