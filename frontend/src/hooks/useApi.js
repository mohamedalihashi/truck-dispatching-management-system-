import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import { useSocket } from "../contexts/SocketContext";
import { useAuth } from "../contexts/AuthContext";
import { isRealtimeSocketEnabled } from "../config/api.js";
import { useEffect } from "react";

export const TRIPS_QUERY_DEFAULT = { limit: 50 };

function normalizeParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function patchTripLocationInCache(qc, payload) {
  if (!payload?.tripId) return;

  qc.setQueriesData({ queryKey: ["trips"] }, (old) => {
    if (!old?.data) return old;
    return {
      ...old,
      data: old.data.map((trip) =>
        trip.id === payload.tripId
          ? {
              ...trip,
              lastLocation: payload.location ?? trip.lastLocation,
              distanceTraveledKm: payload.distanceTraveledKm ?? trip.distanceTraveledKm,
              distance: payload.distance ?? trip.distance,
              status: payload.status ?? trip.status
            }
          : trip
      )
    };
  });

  if (payload.location?.lat != null && payload.location?.lng != null) {
    qc.setQueryData(["trip-route", payload.tripId], (old) => {
      const points = old?.points || [];
      const last = points[points.length - 1];
      if (
        last &&
        Number(last.lat) === Number(payload.location.lat) &&
        Number(last.lng) === Number(payload.location.lng)
      ) {
        return old;
      }
      return { points: [...points, payload.location] };
    });
  } else {
    qc.invalidateQueries({ queryKey: ["trip-route", payload.tripId] });
  }
}

function invalidateForSocketEvent(qc, eventType, payload) {
  const refreshDashboard = () => {
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["reports-summary"] });
    qc.invalidateQueries({ queryKey: ["user-activity-report"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  if (!eventType) return;

  if (
    eventType.startsWith("order.") ||
    eventType.startsWith("quote.") ||
    eventType === "driver.assigned"
  ) {
    qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
    refreshDashboard();
    return;
  }

  if (eventType === "location.updated") {
    patchTripLocationInCache(qc, payload);
    refreshDashboard();
    return;
  }

  if (eventType.startsWith("trip.")) {
    qc.invalidateQueries({ queryKey: ["trips"] });
    qc.invalidateQueries({ queryKey: ["trip-route"] });
    refreshDashboard();
    return;
  }

  if (eventType.startsWith("notification.")) {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    return;
  }

  if (eventType.startsWith("payment.")) {
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["earnings"] });
    refreshDashboard();
    return;
  }

  qc.invalidateQueries({ queryKey: ["cargo-requests"] });
  qc.invalidateQueries({ queryKey: ["trips"] });
  refreshDashboard();
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboardReport(),
    staleTime: 30_000
  });
}

export function useDashboardSummary(options = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard-summary", user?.id],
    queryFn: () => api.dashboardSummary(),
    staleTime: 30_000,
    enabled: Boolean(user?.id),
    ...options
  });
}

export function useReportsSummary(options = {}) {
  return useQuery({
    queryKey: ["reports-summary"],
    queryFn: () => api.reportsSummary(),
    staleTime: 60_000,
    ...options
  });
}

export function useCargoRequests(params = {}, options = {}) {
  const { user } = useAuth();
  const normalized = normalizeParams(params);
  return useQuery({
    queryKey: ["cargo-requests", user?.id, normalized],
    queryFn: () => api.listCargoRequests(normalized),
    staleTime: 15_000,
    enabled: Boolean(user?.id),
    ...options
  });
}

export function useCargoRequestSummary(options = {}) {
  return useQuery({
    queryKey: ["cargo-requests-summary"],
    queryFn: () => api.cargoRequestSummary(),
    ...options
  });
}

export function useTrips(params = {}, options = {}) {
  const { user } = useAuth();
  const normalized = { ...TRIPS_QUERY_DEFAULT, ...normalizeParams(params) };
  return useQuery({
    queryKey: ["trips", user?.id, normalized],
    queryFn: () => api.listTrips(normalized),
    staleTime: 15_000,
    enabled: Boolean(user?.id),
    ...options
  });
}

export function useTripSummary(options = {}) {
  return useQuery({
    queryKey: ["trips-summary"],
    queryFn: () => api.tripSummary(),
    ...options
  });
}

export function useTripRoute(tripId, options = {}) {
  return useQuery({
    queryKey: ["trip-route", tripId],
    queryFn: () => api.getTripLocations(tripId),
    enabled: Boolean(tripId),
    ...options
  });
}

export function useLiveFleet(params = {}, options = {}) {
  return useQuery({
    queryKey: ["live-fleet", params],
    queryFn: () => api.listLiveFleet(params),
    ...options
  });
}

export function useTripReplay(tripId, options = {}) {
  return useQuery({
    queryKey: ["trip-replay", tripId],
    queryFn: () => api.getTripReplay(tripId),
    enabled: Boolean(tripId),
    ...options
  });
}

export function useTripEvents(tripId, options = {}) {
  return useQuery({
    queryKey: ["trip-events", tripId],
    queryFn: () => api.getTripEvents(tripId),
    enabled: Boolean(tripId),
    ...options
  });
}

export function useTripFeedback(params = {}, options = {}) {
  return useQuery({
    queryKey: ["trip-feedback", params],
    queryFn: () => api.listTripFeedback(params),
    ...options
  });
}

export function useTrucks(params = {}) {
  return useQuery({
    queryKey: ["trucks", params],
    queryFn: () => api.listTrucks(params)
  });
}

export function useTruckSummary(options = {}) {
  return useQuery({
    queryKey: ["trucks-summary"],
    queryFn: () => api.truckSummary(),
    ...options
  });
}

export function useNotifications(params = {}, options = {}) {
  const normalized = normalizeParams({ limit: 20, ...params });
  return useQuery({
    queryKey: ["notifications", normalized],
    queryFn: () => api.listNotifications(normalized),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    ...options
  });
}

export function useUsers(params = {}, options = {}) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => api.listUsers(params),
    ...options
  });
}

export function useUserSummary(options = {}) {
  return useQuery({
    queryKey: ["users-summary"],
    queryFn: () => api.userSummary(),
    ...options
  });
}

export function useDrivers(params = {}) {
  return useUsers({ role: "driver", limit: 100, ...params });
}

export function useCustomers(params = {}, options = {}) {
  const { enabled, ...rest } = params;
  return useUsers(
    { role: "customer", limit: 100, ...rest },
    { enabled, ...options }
  );
}

export function usePayments(params = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["payments", user?.id, params],
    queryFn: () => api.listPayments(params),
    enabled: Boolean(user?.id)
  });
}

export function useAuditLogs(params = {}, options = {}) {
  const normalized = normalizeParams(params);
  return useQuery({
    queryKey: ["audit-logs", normalized],
    queryFn: () => api.listAuditLogs(normalized),
    staleTime: 30_000,
    ...options
  });
}

export function useRealtimeInvalidation() {
  const qc = useQueryClient();
  const { events } = useSocket();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!events[0]) return;
    invalidateForSocketEvent(qc, events[0].type, events[0].payload);
  }, [events[0]?.id, qc]);

  useEffect(() => {
    if (!isAuthenticated || isRealtimeSocketEnabled()) return;

    const invalidateLight = () => {
      if (document.hidden) return;
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    };

    const timer = setInterval(invalidateLight, 10_000);
    const onVisibility = () => {
      if (!document.hidden) invalidateLight();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isAuthenticated, qc]);
}

export function useCreateCargo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.createCargoRequest(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
}

export function useUpdateCargo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => api.updateCargoRequest(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
}

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["users-summary"] });
    qc.invalidateQueries({ queryKey: ["trucks-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["reports-summary"] });
    qc.invalidateQueries({ queryKey: ["user-activity-report"] });
  };
  return {
    create: useMutation({
      mutationFn: (payload) => api.createUser(payload),
      onSuccess: invalidate
    }),
    update: useMutation({
      mutationFn: ({ id, payload }) => api.updateUser(id, payload),
      onSuccess: invalidate
    }),
    verifyDriver: useMutation({
      mutationFn: (id) => api.verifyDriver(id),
      onSuccess: invalidate
    })
  };
}

export function useTruckMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trucks"] });
    qc.invalidateQueries({ queryKey: ["trucks-summary"] });
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["users-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    create: useMutation({
      mutationFn: (payload) => api.createTruck(payload),
      onSuccess: invalidate
    }),
    update: useMutation({
      mutationFn: ({ id, payload }) => api.updateTruck(id, payload),
      onSuccess: invalidate
    }),
    remove: useMutation({
      mutationFn: (id) => api.deleteTruck(id),
      onSuccess: invalidate
    })
  };
}

export function useProfileUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.updateProfile(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] })
  });
}

export function usePaymentMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["earnings"] });
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  return {
    update: useMutation({
      mutationFn: ({ id, ...payload }) => api.updatePayment(id, payload),
      onSuccess: invalidate
    }),
    updateCustomer: useMutation({
      mutationFn: ({ id, ...payload }) => api.updateCustomerPayment(id, payload),
      onSuccess: invalidate
    }),
    create: useMutation({
      mutationFn: (payload) => api.createPayment(payload),
      onSuccess: invalidate
    }),
    remove: useMutation({
      mutationFn: (id) => api.deletePayment(id),
      onSuccess: invalidate
    }),
    payWithWaafi: useMutation({
      mutationFn: (payload) => api.payWithWaafi(payload),
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["earnings"] });
      }
    })
  };
}

export function useEarnings(params = {}, options = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return useQuery({
    queryKey: ["earnings", isAdmin ? "all" : "me", params],
    queryFn: () => (isAdmin ? api.getEarnings(params) : api.getMyEarnings(params)),
    ...options
  });
}

export function useEarningsSummary() {
  return useQuery({
    queryKey: ["earnings", "summary"],
    queryFn: () => api.getEarningsSummary()
  });
}

export function useEarningMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["earnings"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    payout: useMutation({
      mutationFn: ({ id, ...payload }) => api.payoutEarning(id, payload),
      onSuccess: invalidate
    }),
    payoutAll: useMutation({
      mutationFn: ({ userId, ...payload }) => api.payoutUserEarnings(userId, payload),
      onSuccess: invalidate
    })
  };
}

export function useSettings(options = {}) {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
    staleTime: 60_000,
    ...options
  });
}

export function useSupportContact() {
  return useQuery({
    queryKey: ["support-contact"],
    queryFn: () => api.getSupportContact(),
    staleTime: 5 * 60_000
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ["permissions"],
    queryFn: () => api.myPermissions(),
    staleTime: 30_000
  });
}

export function useSupportComplaints(params = {}, options = {}) {
  return useQuery({
    queryKey: ["support-complaints", params],
    queryFn: () => api.listSupportComplaints(params),
    ...options
  });
}

export function useCancelCargo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.cancelCargoRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trucks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
}

export function useRestoreCargo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.restoreCargoRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
      qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trucks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  });
}

export function useAssignCargo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => api.assignCargoRequest(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trucks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  });
}

export function useAssignSharedPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.assignSharedPool(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
      qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
      qc.invalidateQueries({ queryKey: ["shared-trips"] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trucks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  });
}

export function useTripActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trips"] });
    qc.invalidateQueries({ queryKey: ["trips-summary"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
    qc.invalidateQueries({ queryKey: ["trucks"] });
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    updateStatus: useMutation({
      mutationFn: ({ id, status, weightAmount, weightUnit, measuredQuantity, measurementUnit }) =>
        api.updateTripStatus(id, {
          status,
          ...(measuredQuantity != null
            ? { measuredQuantity, measurementUnit }
            : weightAmount != null
              ? { weightAmount, weightUnit: weightUnit || "tons" }
              : {})
        }),
      onMutate: async ({ id, status }) => {
        await qc.cancelQueries({ queryKey: ["trips"] });
        const snapshots = qc.getQueriesData({ queryKey: ["trips"] });
        qc.setQueriesData({ queryKey: ["trips"] }, (current) => {
          if (!current?.data) return current;
          return {
            ...current,
            data: current.data.map((trip) => trip.id === id ? { ...trip, status } : trip)
          };
        });
        return { snapshots };
      },
      onError: (_error, _variables, context) => {
        context?.snapshots?.forEach(([key, value]) => qc.setQueryData(key, value));
      },
      onSettled: invalidate
    }),
    accept: useMutation({
      // No optimistic status flip — that unmounted Accept UI before errors could show.
      mutationFn: (id) => api.acceptTrip(id),
      onSettled: invalidate
    }),
    reject: useMutation({
      mutationFn: (id) => api.rejectTrip(id),
      onSettled: invalidate
    }),
    adjustAssignment: useMutation({
      mutationFn: ({ id, ...payload }) => api.adjustAssignment(id, payload),
      onSuccess: invalidate
    }),
    shareLocation: useMutation({
      mutationFn: ({ id, lat, lng }) => api.updateTripLocation(id, { lat, lng })
    })
  };
}
