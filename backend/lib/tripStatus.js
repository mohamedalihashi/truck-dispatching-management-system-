/** Driver must advance one step at a time along this chain. */
export const DRIVER_TRIP_NEXT = {
  Assigned: "Accepted",
  Accepted: "Arrived Pickup",
  "Arrived Pickup": "Loaded",
  Loaded: "In Transit",
  "In Transit": "Delivered",
};

export const DISPATCHER_TRIP_STATUSES = ["Delayed", "Cancelled"];

/**
 * Validate a trip status change for a given role.
 * @returns {{ ok: true } | { ok: false, status: number, message: string }}
 */
export function validateTripStatusChange({
  currentStatus,
  nextStatus,
  role,
  hasDeliveryProof = false,
}) {
  if (role === "driver") {
    const expected = DRIVER_TRIP_NEXT[currentStatus];
    if (expected !== nextStatus) {
      return {
        ok: false,
        status: 400,
        message: `Driver must move from ${currentStatus} to ${expected || "no further status"}`,
      };
    }
  }

  if (nextStatus === "Delivered" && !hasDeliveryProof) {
    return {
      ok: false,
      status: 400,
      message: "Upload proof of delivery before marking the trip delivered",
    };
  }

  return { ok: true };
}

/** Cargo request status synced from a trip status update. */
export function cargoStatusFromTripStatus(tripStatus) {
  if (tripStatus === "Delayed") return "In Transit";
  if (tripStatus === "Cancelled") return "Cancelled";
  return tripStatus;
}
