import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";
import { useTrips } from "./useApi";
import { LIVE_TRACKING_STATUSES } from "../utils/helpers";

const SEND_INTERVAL_MS = 5_000;

export function useDriverGpsTracking() {
  const { user } = useAuth();
  const isDriver = user?.role === "driver";
  const { data } = useTrips(
    { limit: 50 },
    { enabled: isDriver, refetchInterval: isDriver ? 30_000 : false, refetchIntervalInBackground: false }
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

    async function sendLocation(lat, lng, force = false) {
      const tripId = tripIdRef.current;
      if (!tripId) return;

      const now = Date.now();
      if (!force && now - lastSendRef.current < SEND_INTERVAL_MS) return;

      lastSendRef.current = now;
      try {
        await api.updateTripLocation(tripId, { lat, lng });
        setLastSentAt(new Date());
        setError("");
      } catch (err) {
        setError(err.message || "Could not send GPS location");
      }
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        positionRef.current = { lat, lng };
        sendLocation(lat, lng);
      },
      (geoError) => {
        setActive(false);
        if (geoError?.code === geoError.PERMISSION_DENIED) {
          setError("Allow location access in the browser so live tracking can work.");
        } else {
          setError("Waiting for GPS signal…");
        }
      },
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 }
    );

    navigator.geolocation.getCurrentPosition(
      (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude, true),
      () => {},
      { enableHighAccuracy: true, timeout: 15_000 }
    );

    const timer = setInterval(() => {
      if (positionRef.current) {
        sendLocation(positionRef.current.lat, positionRef.current.lng, true);
      }
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
    active,
    error,
    lastSentAt
  };
}
