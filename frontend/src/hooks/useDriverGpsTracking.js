import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";
import { useTrips } from "./useApi";
import { LIVE_TRACKING_STATUSES } from "../utils/helpers";

const SEND_INTERVAL_MS = 10_000;

/** Stream driver GPS (lat/lng/speed/heading) while a trip is active. */
export function useDriverGpsTracking() {
  const { user } = useAuth();
  const isDriver = user?.role === "driver";
  const { data } = useTrips(
    { limit: 50 },
    { enabled: isDriver, refetchInterval: isDriver ? 30_000 : false, refetchIntervalInBackground: true }
  );
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [lastSentAt, setLastSentAt] = useState(null);

  const watchIdRef = useRef(null);
  const lastSendRef = useRef(0);
  const tripIdRef = useRef(null);
  const positionRef = useRef(null);

  const trackingTrip = (data?.data || []).find((trip) => LIVE_TRACKING_STATUSES.includes(trip.status));

  useEffect(() => {
    if (!isDriver || !trackingTrip?.id) {
      setActive(false);
      setError("");
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      tripIdRef.current = null;
      return;
    }

    if (!navigator.geolocation) {
      setActive(false);
      setError("This browser does not support GPS.");
      return;
    }

    tripIdRef.current = trackingTrip.id;
    setActive(true);
    setError("");

    async function sendLocation(coords, force = false) {
      const tripId = tripIdRef.current;
      if (!tripId || !coords) return;

      const now = Date.now();
      if (!force && now - lastSendRef.current < SEND_INTERVAL_MS) return;

      lastSendRef.current = now;
      const speedMs = Number(coords.speed);
      const speedKmh =
        Number.isFinite(speedMs) && speedMs >= 0 ? Math.round(speedMs * 3.6 * 10) / 10 : null;
      const heading = Number(coords.heading);
      try {
        await api.updateTripLocation(tripId, {
          lat: coords.latitude,
          lng: coords.longitude,
          ...(Number.isFinite(coords.accuracy) ? { accuracy: coords.accuracy } : {}),
          ...(speedKmh != null ? { speedKmh } : {}),
          ...(Number.isFinite(heading) && heading >= 0 ? { heading } : {}),
          timestamp: new Date().toISOString(),
        });
        setLastSentAt(new Date());
        setError("");
      } catch (err) {
        setError(err.message || "Could not send GPS location");
      }
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        positionRef.current = pos.coords;
        sendLocation(pos.coords);
      },
      (geoError) => {
        setActive(false);
        if (geoError?.code === geoError.PERMISSION_DENIED) {
          setError("Allow location access so live tracking and distance billing can work.");
        } else {
          setError("Waiting for GPS signal…");
        }
      },
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 }
    );

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        positionRef.current = pos.coords;
        sendLocation(pos.coords, true);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15_000 }
    );

    const timer = setInterval(() => {
      if (positionRef.current) sendLocation(positionRef.current, true);
    }, SEND_INTERVAL_MS);

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      clearInterval(timer);
      setActive(false);
    };
  }, [isDriver, trackingTrip?.id]);

  return {
    trackingTripId: trackingTrip?.id ?? null,
    distanceTraveledKm: trackingTrip?.distanceTraveledKm ?? null,
    active,
    error,
    lastSentAt,
  };
}
