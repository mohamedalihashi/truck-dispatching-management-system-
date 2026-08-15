/**
 * Shared trip stop helpers — addresses for lists only.
 * Map pins for from/to city estimates are not used; live GPS is shown separately.
 */

function sortBookings(bookings, orderKey) {
  return [...(bookings || [])].sort((a, b) => {
    const ao = a[orderKey] ?? 9999;
    const bo = b[orderKey] ?? 9999;
    if (ao !== bo) return ao - bo;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });
}

export function formatStopAddress(cargo, kind) {
  if (!cargo) return "—";
  if (kind === "pickup") {
    const structured = [cargo.fromNeighborhood, cargo.fromDistrict, cargo.fromRegion]
      .map((p) => String(p || "").trim())
      .filter(Boolean);
    if (structured.length >= 2) return structured.join(", ");
    return cargo.pickup || structured.join(", ") || "—";
  }
  const structured = [cargo.toNeighborhood, cargo.toDistrict, cargo.toRegion]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  if (structured.length >= 2) return structured.join(", ");
  return cargo.destination || structured.join(", ") || "—";
}

/** Normalize pickup key so "same place" loads share one pickup action.
 * Same district + region = isku meel (neighborhood may differ slightly).
 */
export function pickupLocationKey(cargo, fallbackPickup = "") {
  if (!cargo && !fallbackPickup) return "";
  const district = String(cargo?.fromDistrict || "").trim().toLowerCase();
  const region = String(cargo?.fromRegion || "").trim().toLowerCase();
  if (district && region) {
    return `${district}|${region}`;
  }
  return String(cargo?.pickup || fallbackPickup || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
export function bookingsShareSamePickup(bookings = [], fallbackPickup = "") {
  if (!bookings.length) return false;
  const keys = bookings.map((b) => pickupLocationKey(b.cargoRequest, fallbackPickup || b.cargoRequest?.pickup));
  if (keys.some((k) => !k)) return false;
  return keys.every((k) => k === keys[0]);
}

export function buildSharedStops(bookings, kind = "pickup") {
  const orderKey = kind === "pickup" ? "pickupOrder" : "deliveryOrder";
  return sortBookings(bookings, orderKey).map((b, index) => {
    const order = b[orderKey] ?? index + 1;
    return {
      id: `${kind}-${b.id}`,
      bookingId: b.id,
      order,
      kind,
      label: b.customer ? `Macmiil: ${b.customer}` : "Macmiil",
      cargoRequestId: b.cargoRequestId,
      tripId: b.tripId || null,
      status: b.status,
      weight: b.cargoRequest?.weight || (b.weightTons ? `${b.weightTons} t` : null),
      fare: b.cargoRequest?.finalPrice ?? b.cargoRequest?.quotedPrice ?? null,
      address: formatStopAddress(b.cargoRequest, kind),
      senderPhone: b.cargoRequest?.senderPhone || null,
      receiverPhone: b.cargoRequest?.receiverPhone || null,
      // No estimated city lat/lng — map uses live GPS only
      lat: null,
      lng: null,
      booking: b,
    };
  });
}

export function bookingIdsInOrder(bookings, kind = "pickup") {
  return buildSharedStops(bookings, kind).map((s) => s.bookingId);
}
