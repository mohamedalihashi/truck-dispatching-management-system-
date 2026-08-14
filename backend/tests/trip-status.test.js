import { describe, expect, it } from "vitest";
import {
  DRIVER_TRIP_NEXT,
  cargoStatusFromTripStatus,
  validateTripStatusChange,
} from "../lib/tripStatus.js";

describe("driver trip status chain", () => {
  it("defines the forward-only driver path", () => {
    expect(DRIVER_TRIP_NEXT).toEqual({
      Assigned: "En Route to Pickup",
      "En Route to Pickup": "Arrived at Pickup",
      "Arrived at Pickup": "Picked Up",
      "Picked Up": "In Transit",
      "In Transit": "Near Destination",
      "Near Destination": "Delivered",
    });
  });

  it("allows each valid driver step", () => {
    for (const [from, to] of Object.entries(DRIVER_TRIP_NEXT)) {
      const needsProof = to === "Delivered";
      expect(
        validateTripStatusChange({
          currentStatus: from,
          nextStatus: to,
          role: "driver",
          hasDeliveryProof: needsProof,
        })
      ).toEqual({ ok: true });
    }
  });

  it("rejects skipping or going backwards", () => {
    const bad = validateTripStatusChange({
      currentStatus: "Assigned",
      nextStatus: "In Transit",
      role: "driver",
    });
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(400);
    expect(bad.message).toMatch(/Assigned to En Route to Pickup/);
  });

  it("requires POD before Delivered", () => {
    const noProof = validateTripStatusChange({
      currentStatus: "Near Destination",
      nextStatus: "Delivered",
      role: "driver",
      hasDeliveryProof: false,
    });
    expect(noProof).toMatchObject({ ok: false, status: 400 });
    expect(noProof.message).toMatch(/proof of delivery/i);

    expect(
      validateTripStatusChange({
        currentStatus: "Near Destination",
        nextStatus: "Delivered",
        role: "driver",
        hasDeliveryProof: true,
      })
    ).toEqual({ ok: true });
  });

  it("moves Arrived at Pickup to Picked Up (weight enforced by API)", () => {
    expect(DRIVER_TRIP_NEXT["Arrived at Pickup"]).toBe("Picked Up");
  });
});

describe("admin trip status rules", () => {
  it("allows Cancelled from In Transit", () => {
    expect(
      validateTripStatusChange({
        currentStatus: "In Transit",
        nextStatus: "Cancelled",
        role: "admin",
      })
    ).toEqual({ ok: true });
  });
});

describe("cargoStatusFromTripStatus", () => {
  it("passes trip statuses through for cargo sync", () => {
    expect(cargoStatusFromTripStatus("Cancelled")).toBe("Cancelled");
    expect(cargoStatusFromTripStatus("Picked Up")).toBe("Picked Up");
    expect(cargoStatusFromTripStatus("Near Destination")).toBe("Near Destination");
  });
});
