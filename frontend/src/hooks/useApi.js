import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import { useSocket } from "../contexts/SocketContext";
import { useAuth } from "../contexts/AuthContext";
import { isRealtimeSocketEnabled } from "../config/api.js";
import { useEffect } from "react";

export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: () => api.dashboardReport() });
}

export function useDashboardAnalytics() {
  return useQuery({
    queryKey: ["dashboard-analytics"],
    queryFn: () => api.dashboardAnalytics()
  });
}

export function useCargoRequests(params = {}) {
  return useQuery({
    queryKey: ["cargo-requests", params],
    queryFn: () => api.listCargoRequests(params)
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
  return useQuery({
    queryKey: ["trips", params],
    queryFn: () => api.listTrips(params),
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

export function useTripSummary(options = {}) {
  return useQuery({
    queryKey: ["trips-summary"],
    queryFn: () => api.tripSummary(),
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

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.listNotifications()
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

export function useReports(period = "monthly") {
  return useQuery({
    queryKey: ["reports", period],
    queryFn: async () => {
      const [revenue, performance, shipments] = await Promise.all([
        api.revenueReport(period),
        api.performanceReport(),
        api.shipmentsReport()
      ]);
      return { revenue, performance, shipments };
    }
  });
}

export function usePayments(params = {}) {
  return useQuery({
    queryKey: ["payments", params],
    queryFn: () => api.listPayments(params)
  });
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.listAuditLogs()
  });
}

export function useRealtimeInvalidation() {
  const qc = useQueryClient();
  const { events } = useSocket();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!events[0]) return;
    qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
    qc.invalidateQueries({ queryKey: ["trips"] });
    qc.invalidateQueries({ queryKey: ["trip-route"] });
    qc.invalidateQueries({ queryKey: ["trucks"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
    qc.invalidateQueries({ queryKey: ["trip-feedback"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["earnings"] });
  }, [events[0]?.id, qc]);

  // Vercel has no WebSocket server — poll API every 20s when logged in.
  useEffect(() => {
    if (!isAuthenticated || isRealtimeSocketEnabled()) return;

    const invalidateAll = () => {
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trip-route"] });
      qc.invalidateQueries({ queryKey: ["trucks"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["trip-feedback"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["earnings"] });
    };

    const timer = setInterval(invalidateAll, 20_000);
    return () => clearInterval(timer);
  }, [isAuthenticated, qc]);
}

export function useCreateCargo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.createCargoRequest(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
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
    qc.invalidateQueries({ queryKey: ["dashboard"] });
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
    remove: useMutation({
      mutationFn: (id) => api.deleteUser(id),
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
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
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
    ...options
  });
}

export function usePricing(options = {}) {
  return useQuery({
    queryKey: ["pricing"],
    queryFn: () => api.getPricing(),
    ...options
  });
}

export function usePricingMutations() {
  const qc = useQueryClient();
  return {
    save: useMutation({
      mutationFn: (payload) => api.updatePricing(payload),
      onSuccess: (data) => {
        qc.setQueryData(["pricing"], data);
        qc.invalidateQueries({ queryKey: ["pricing"] });
      }
    }),
    calculate: useMutation({
      mutationFn: (id) => api.calculateQuote(id),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["cargo-requests"] });
        qc.invalidateQueries({ queryKey: ["cargo-request-summary"] });
      }
    }),
    adjust: useMutation({
      mutationFn: ({ id, ...payload }) => api.adjustQuotePrice(id, payload),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["cargo-requests"] });
        qc.invalidateQueries({ queryKey: ["cargo-request-summary"] });
      }
    }),
    pay: useMutation({
      mutationFn: (id) => api.payQuote(id),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["payments"] });
        qc.invalidateQueries({ queryKey: ["cargo-requests"] });
      }
    })
  };
}

export function usePermissions() {
  return useQuery({
    queryKey: ["permissions"],
    queryFn: () => api.myPermissions(),
    staleTime: 30_000
  });
}

export function useUserActivityReport(params, options = {}) {
  return useQuery({
    queryKey: ["user-activity-report", params],
    queryFn: () => api.userActivityReport(params),
    enabled: Boolean(params?.userId),
    ...options
  });
}

export function useDeliveryFeedbackReport(params = {}) {
  return useQuery({
    queryKey: ["delivery-feedback-report", params],
    queryFn: () => api.deliveryFeedbackReport(params)
  });
}

export function useSmsNotifications(params = {}) {
  return useQuery({
    queryKey: ["sms-notifications", params],
    queryFn: () => api.listSmsNotifications(params)
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
      qc.invalidateQueries({ queryKey: ["trip-route"] });
      qc.invalidateQueries({ queryKey: ["trucks"] });
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
      qc.invalidateQueries({ queryKey: ["trip-route"] });
      qc.invalidateQueries({ queryKey: ["trucks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  });
}

export function useQuoteMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
    qc.invalidateQueries({ queryKey: ["trips"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    submit: useMutation({
      mutationFn: ({ id, payload }) => api.submitCargoQuote(id, payload),
      onSuccess: invalidate
    }),
    accept: useMutation({
      mutationFn: (id) => api.acceptCargoQuote(id),
      onSuccess: invalidate
    }),
    reject: useMutation({
      mutationFn: ({ id, note }) => api.rejectCargoQuote(id, { note }),
      onSuccess: invalidate
    })
  };
}

export function useTripActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trips"] });
    qc.invalidateQueries({ queryKey: ["trips-summary"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    qc.invalidateQueries({ queryKey: ["cargo-requests-summary"] });
    qc.invalidateQueries({ queryKey: ["trucks"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  return {
    updateStatus: useMutation({
      mutationFn: ({ id, status }) => api.updateTripStatus(id, status),
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
      mutationFn: (id) => api.acceptTrip(id),
      onMutate: async (id) => {
        await qc.cancelQueries({ queryKey: ["trips"] });
        const snapshots = qc.getQueriesData({ queryKey: ["trips"] });
        qc.setQueriesData({ queryKey: ["trips"] }, (current) => {
          if (!current?.data) return current;
          return {
            ...current,
            data: current.data.map((trip) => trip.id === id ? { ...trip, status: "Accepted" } : trip)
          };
        });
        return { snapshots };
      },
      onError: (_error, _id, context) => {
        context?.snapshots?.forEach(([key, value]) => qc.setQueryData(key, value));
      },
      onSettled: invalidate
    }),
    reject: useMutation({
      mutationFn: (id) => api.rejectTrip(id),
      onSuccess: invalidate
    }),
    restore: useMutation({
      mutationFn: (id) => api.restoreTrip(id),
      onSuccess: invalidate
    }),
    shareLocation: useMutation({
      mutationFn: ({ id, lat, lng }) => api.updateTripLocation(id, { lat, lng }),
      onSuccess: invalidate
    })
  };
}
