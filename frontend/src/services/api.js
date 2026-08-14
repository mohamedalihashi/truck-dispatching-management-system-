import axios from "axios";
import { getApiBaseUrl } from "../config/api.js";

const API_BASE_URL = getApiBaseUrl();

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000
});

apiClient.interceptors.request.use((config) => {
  config.metadata = { startTime: Date.now() };
  const token = localStorage.getItem("td_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV && response.config?.metadata?.startTime) {
      const duration = Date.now() - response.config.metadata.startTime;
      console.log(
        `${response.config.method?.toUpperCase()} ${response.config.url}: ${duration}ms`
      );
    }
    return response.data;
  },
  (error) => {
    if (import.meta.env.DEV && error.config?.metadata?.startTime) {
      const duration = Date.now() - error.config.metadata.startTime;
      console.error(
        `${error.config.method?.toUpperCase()} ${error.config.url}: ${duration}ms`
      );
    }
    const data = error.response?.data;
    const status = error.response?.status;
    let message = data?.message;

    if (!message) {
      if (!error.response) {
        const code = error.code || error.cause?.code;
        if (code === "ECONNRESET" || code === "ECONNREFUSED" || error.message?.includes("Network Error")) {
          message = "Server is restarting. Wait a few seconds and try again.";
        } else {
          message = "Cannot reach the server. Start the app with npm run dev and try again.";
        }
      } else if (status === 503) {
        message = data?.message || "Database is busy. Please wait a moment and try again.";
      } else if (status === 502 || status === 504) {
        message = "Server is restarting. Wait a few seconds and try again.";
      } else if (status === 500) {
        // Vite proxy often returns bare 500 HTML when the backend restarts mid-request
        const looksLikeProxyDrop =
          typeof data !== "object" || data === null || !data.message;
        message = looksLikeProxyDrop
          ? "Server is restarting. Wait a few seconds and try again."
          : data.message;
      } else {
        message = error.message || "Request failed";
      }
    }

    const err = new Error(message);
    if (data?.details) err.details = data.details;
    if (data?.issues) {
      err.issues = data.issues;
      const firstIssue = data.issues[0];
      const issueMessage = typeof firstIssue === "string" ? firstIssue : firstIssue?.message;
      if (issueMessage && message === "Validation failed") {
        err.message = issueMessage;
      }
    }
    return Promise.reject(err);
  }
);

export const api = {
  health: () => apiClient.get("/health"),
  register: (payload) => apiClient.post("/auth/register", payload, {
    headers: payload instanceof FormData ? { "Content-Type": "multipart/form-data" } : undefined
  }),
  verifyRegister: (payload) => apiClient.post("/auth/register/verify", payload),
  login: (payload) => apiClient.post("/auth/login", payload),
  verifyLogin: (payload) => apiClient.post("/auth/login/verify", payload),
  logout: () => apiClient.post("/auth/logout"),
  resendCode: (payload) => apiClient.post("/auth/resend-code", payload),
  changePassword: (payload) => apiClient.post("/auth/change-password", payload),
  me: () => apiClient.get("/auth/me"),
  myPermissions: () => apiClient.get("/auth/permissions"),
  updateProfile: (payload) => apiClient.patch("/auth/me", payload),
  uploadAvatar: (formData) =>
    apiClient.post("/auth/me/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    }),
  forgotPassword: (email) => apiClient.post("/auth/forgot-password", { email }),
  resetPassword: (payload) => apiClient.post("/auth/reset-password", payload),
  listUsers: (params = {}) => apiClient.get("/users", { params }),
  userSummary: () => apiClient.get("/users/summary"),
  createUser: (payload) => {
    if (payload instanceof FormData) {
      return apiClient.post("/users", payload, {
        headers: { "Content-Type": "multipart/form-data" }
      });
    }
    return apiClient.post("/users", payload);
  },
  updateUser: (id, payload) => apiClient.patch(`/users/${id}`, payload),
  verifyDriver: (id) => apiClient.post(`/users/${id}/verify-driver`),
  createCargoRequest: (payload) => apiClient.post("/cargo-requests", payload),
  updateCargoRequest: (id, payload) => apiClient.patch(`/cargo-requests/${id}`, payload),
  listCargoRequests: (params = {}) => apiClient.get("/cargo-requests", { params }),
  cargoRequestSummary: () => apiClient.get("/cargo-requests/summary"),
  assignCargoRequest: (id, payload) => apiClient.patch(`/cargo-requests/${id}/assign`, payload),
  uploadCargoImage: (id, formData) =>
    apiClient.post(`/cargo-requests/${id}/image`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    }),
  cancelCargoRequest: (id) => apiClient.delete(`/cargo-requests/${id}`),
  restoreCargoRequest: (id) => apiClient.post(`/cargo-requests/${id}/restore`),
  listTrips: (params = {}) => apiClient.get("/trips", { params }),
  tripSummary: () => apiClient.get("/trips/summary"),
  listTripFeedback: (params = {}) => apiClient.get("/trips/feedback", { params }),
  adjustAssignment: (id, payload) => apiClient.patch(`/trips/${id}/assignment`, payload),
  updateTripStatus: (id, payload) =>
    apiClient.patch(`/trips/${id}/status`, typeof payload === "string" ? { status: payload } : payload),
  acceptTrip: (id) => apiClient.post(`/trips/${encodeURIComponent(id)}/accept`),
  rejectTrip: (id) => apiClient.post(`/trips/${encodeURIComponent(id)}/reject`),
  updateTripLocation: (id, payload) =>
    apiClient.patch(`/trips/${encodeURIComponent(id)}/location`, payload),
  getTripLocations: (id) => apiClient.get(`/trips/${id}/locations`),
  getTripReplay: (id) => apiClient.get(`/trips/${encodeURIComponent(id)}/replay`),
  getTripEvents: (id) => apiClient.get(`/trips/${encodeURIComponent(id)}/events`),
  listLiveFleet: (params = {}) => apiClient.get("/trucks/live", { params }),
  listGeofences: () => apiClient.get("/trucks/geofences"),
  createGeofence: (payload) => apiClient.post("/trucks/geofences", payload),
  deleteGeofence: (id) => apiClient.delete(`/trucks/geofences/${encodeURIComponent(id)}`),
  uploadProof: (id, formData) =>
    apiClient.post(`/trips/${id}/proof`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    }),
  confirmTripDelivery: (id) => apiClient.post(`/trips/${id}/confirm-delivery`),
  submitTripFeedback: (id, payload) => apiClient.post(`/trips/${id}/feedback`, payload),
  listTrucks: (params = {}) => apiClient.get("/trucks", { params }),
  truckSummary: () => apiClient.get("/trucks/summary"),
  createTruck: (payload) => apiClient.post("/trucks", payload),
  updateTruck: (id, payload) => apiClient.patch(`/trucks/${id}`, payload),
  deleteTruck: (id) => apiClient.delete(`/trucks/${id}`),
  listNotifications: (params = {}) => apiClient.get("/notifications", { params }),
  markNotificationRead: (id) => apiClient.patch(`/notifications/${id}/read`),
  dashboardReport: () => apiClient.get("/reports/dashboard"),
  dashboardSummary: () => apiClient.get("/reports/dashboard-summary"),
  reportsSummary: () => apiClient.get("/reports/summary"),
  userActivityReport: (params = {}) => apiClient.get("/reports/user-activity", { params }),
  listPayments: (params = {}) => apiClient.get("/admin/payments", { params }),
  createPayment: (payload) => apiClient.post("/admin/payments", payload),
  updatePayment: (id, payload) => apiClient.patch(`/admin/payments/${id}`, payload),
  updateCustomerPayment: (id, payload) => apiClient.patch(`/payments/${id}`, payload),
  deletePayment: (id) => apiClient.delete(`/admin/payments/${id}`),
  getWaafiConfig: () => apiClient.get("/payments/waafi/config"),
  payWithWaafi: (payload) => apiClient.post("/payments/waafi/purchase", payload),
  getEarnings: (params) => apiClient.get("/earnings", { params }),
  getMyEarnings: (params) => apiClient.get("/earnings/me", { params }),
  getEarningsSummary: () => apiClient.get("/earnings/summary"),
  payoutEarning: (id, payload) => apiClient.post(`/earnings/${id}/payout`, payload),
  payoutUserEarnings: (userId, payload) => apiClient.post(`/earnings/user/${userId}/payout-all`, payload),
  getSettings: () => apiClient.get("/admin/settings"),
  updateSettings: (key, value) => apiClient.put(`/admin/settings/${key}`, value),
  updateRolePermissions: (value) => apiClient.put("/admin/settings/rolePermissions", value),
  payQuote: (id) => apiClient.post(`/quotes/${encodeURIComponent(id)}/pay`),
  listAuditLogs: (params = {}) => apiClient.get("/admin/audit-logs", { params }),
  listSupportComplaints: (params = {}) => apiClient.get("/support", { params }),
  getSupportContact: () => apiClient.get("/support/contact"),
  createSupportComplaint: (payload) => apiClient.post("/support", payload),
  updateSupportComplaintStatus: (id, payload) => apiClient.patch(`/support/${id}/status`, payload),
  getPublicFeedback: (token) => apiClient.get(`/public/feedback/${encodeURIComponent(token)}`),
  submitPublicFeedback: (token, payload) => apiClient.post(`/public/feedback/${encodeURIComponent(token)}`, payload),
  listPublicTestimonials: (params = {}) => apiClient.get("/public/testimonials", { params }),
  sharedTripsSummary: (params = {}) => apiClient.get("/shared-trips/summary", { params }),
  listSharedTrips: (params = {}) => apiClient.get("/shared-trips", { params }),
  listMySharedTrips: (params = {}) => apiClient.get("/shared-trips/me", { params }),
  getSharedTrip: (id) => apiClient.get(`/shared-trips/${encodeURIComponent(id)}`),
  cancelSharedTrip: (id) => apiClient.post(`/shared-trips/${id}/cancel`),
  acceptSharedTrip: (id) => apiClient.post(`/shared-trips/${encodeURIComponent(id)}/accept`),
  rejectSharedTrip: (id) => apiClient.post(`/shared-trips/${encodeURIComponent(id)}/reject`),
  startSharedTripPickup: (id, payload = {}) =>
    apiClient.post(`/shared-trips/${encodeURIComponent(id)}/pickup`, payload),
  markSharedTripInTransit: (id) => apiClient.post(`/shared-trips/${id}/in-transit`),
  markSharedTripDelivered: (id) => apiClient.post(`/shared-trips/${id}/deliver`),
  reorderSharedTripStops: (id, payload) =>
    apiClient.patch(`/shared-trips/${encodeURIComponent(id)}/stops`, payload),
  deliverSharedBooking: (sharedTripId, bookingId) =>
    apiClient.post(
      `/shared-trips/${encodeURIComponent(sharedTripId)}/bookings/${encodeURIComponent(bookingId)}/deliver`
    ),
  assignSharedPool: (payload) => apiClient.post("/shared-trips/assign-pool", payload)
};

export function saveSession({ token, user }) {
  localStorage.setItem("td_token", token);
  localStorage.setItem("td_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("td_token");
  localStorage.removeItem("td_user");
}

export function loadSession() {
  const token = localStorage.getItem("td_token");
  const raw = localStorage.getItem("td_user");
  if (!token || !raw) return null;
  try {
    return { token, user: JSON.parse(raw) };
  } catch {
    return null;
  }
}
