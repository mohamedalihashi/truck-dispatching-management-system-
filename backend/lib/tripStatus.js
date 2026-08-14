/** Driver advances one step at a time along this chain. */
export const DRIVER_TRIP_NEXT = {
  Assigned: "En Route to Pickup",
  "En Route to Pickup": "Arrived at Pickup",
  "Arrived at Pickup": "Picked Up",
  "Picked Up": "In Transit",
  "In Transit": "Near Destination",
  "Near Destination": "Delivered",
};

export const DISPATCHER_TRIP_STATUSES = ["Cancelled"];

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
  if (tripStatus === "Cancelled") return "Cancelled";
  return tripStatus;
}
