import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { getSocketUrl, isRealtimeSocketEnabled } from "../config/api.js";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const socketRef = useRef(null);
  const realtimeEnabled = isRealtimeSocketEnabled();

  useEffect(() => {
    if (!isAuthenticated || !realtimeEnabled) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socketUrl = getSocketUrl();
    if (!socketUrl) return;

    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      timeout: 10_000
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    const push = (type, payload) => {
      setEvents((items) => [{ id: `${Date.now()}-${type}`, type, payload, at: new Date() }, ...items].slice(0, 30));
    };

    [
      "order.created",
      "driver.assigned",
      "trip.status.updated",
      "notification.created",
      "location.updated",
      "truck:location:update",
      "trip.rejected",
      "trip.feedback.submitted"
    ].forEach((event) =>
      socket.on(event, (payload) => {
        // Inbox is per-user: ignore other users' notifications.
        if (
          event === "notification.created" &&
          payload?.userId &&
          user?.id &&
          String(payload.userId) !== String(user.id)
        ) {
          return;
        }
        // Normalize truck GPS event into the same cache patch path as location.updated
        if (event === "truck:location:update") {
          push("location.updated", payload);
          return;
        }
        push(event, payload);
      })
    );

    if (user?.id) socket.emit("join", user.id);

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated, user?.id, realtimeEnabled]);

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      connected,
      events,
      realtimeEnabled,
      clearEvents: () => setEvents([])
    }),
    [connected, events, realtimeEnabled]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
