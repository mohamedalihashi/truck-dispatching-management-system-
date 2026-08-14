import { describe, expect, it } from "vitest";
import {
  resolveGpsStatus,
  tripProgress,
  estimateEta,
  pointInGeofence,
  getFleetSettings,
} from "../lib/fleetTracking.js";

describe("fleetTracking", () => {
  it("marks GPS offline when last ping is stale", () => {
    const settings = getFleetSettings({ onlineWithinSec: 60 });
    expect(
      resolveGpsStatus({
        lastLocationAt: new Date(Date.now() - 120_000),
        speedKmh: 40,
        settings,
      })
    ).toBe("OFFLINE");
  });

  it("marks moving vs idle from speed", () => {
    const settings = getFleetSettings({ onlineWithinSec: 90, idleSpeedKmh: 3 });
    expect(
      resolveGpsStatus({ lastLocationAt: new Date(), speedKmh: 40, settings })
    ).toBe("MOVING");
    expect(
      resolveGpsStatus({ lastLocationAt: new Date(), speedKmh: 1, settings })
    ).toBe("IDLE");
  });

  it("computes remaining distance and ETA", () => {
    const progress = tripProgress({
      plannedDistanceKm: 100,
      completedDistanceKm: 40,
      currentLat: 2.05,
      currentLng: 45.32,
      destinationLat: 9.56,
      destinationLng: 44.08,
      speedKmh: 50,
    });
    expect(progress.completedDistanceKm).toBe(40);
    expect(progress.remainingDistanceKm).toBeGreaterThan(0);
    expect(progress.etaMinutes).toBeGreaterThan(0);
  });

  it("estimates ETA from remaining km", () => {
    const eta = estimateEta({ remainingKm: 100, speedKmh: 50 });
    expect(eta.etaMinutes).toBe(120);
  });

  it("detects geofence containment", () => {
    const fence = { centerLat: 2.0469, centerLng: 45.3182, radiusM: 5000 };
    expect(pointInGeofence({ lat: 2.0469, lng: 45.3182 }, fence)).toBe(true);
    expect(pointInGeofence({ lat: 9.56, lng: 44.08 }, fence)).toBe(false);
  });
});
