import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { InstallPwaBanner } from "./components/InstallPwaBanner";
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { DriverServiceGuard } from "./components/DriverServiceGuard";
import { useAuth } from "./contexts/AuthContext";
import { roleHome } from "./utils/helpers";

const DashboardLayout = lazy(() => import("./layouts/DashboardLayout").then((m) => ({ default: m.DashboardLayout })));
const PublicTrucksPage = lazy(() => import("./pages/PublicTrucksPage").then((m) => ({ default: m.PublicTrucksPage })));
const PublicFeedbackPage = lazy(() => import("./pages/PublicFeedbackPage").then((m) => ({ default: m.PublicFeedbackPage })));
const PublicInfoPage = lazy(() => import("./pages/PublicInfoPage").then((m) => ({ default: m.PublicInfoPage })));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));
const AdminBookingPage = lazy(() => import("./pages/admin/AdminBookingPage").then((m) => ({ default: m.AdminBookingPage })));
const UsersPage = lazy(() => import("./pages/admin/UsersPage").then((m) => ({ default: m.UsersPage })));
const TrucksPage = lazy(() => import("./pages/admin/TrucksPage").then((m) => ({ default: m.TrucksPage })));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const AuditLogsPage = lazy(() => import("./pages/admin/AuditLogsPage").then((m) => ({ default: m.AuditLogsPage })));
const ReportsPage = lazy(() => import("./pages/admin/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const RequestsPage = lazy(() => import("./pages/shared/RequestsPage").then((m) => ({ default: m.RequestsPage })));
const CustomerDashboard = lazy(() => import("./pages/customer/CustomerDashboard").then((m) => ({ default: m.CustomerDashboard })));
const BookTruckPage = lazy(() => import("./pages/customer/BookTruckPage").then((m) => ({ default: m.BookTruckPage })));
const BrowseTrucksPage = lazy(() => import("./pages/customer/BrowseTrucksPage").then((m) => ({ default: m.BrowseTrucksPage })));
const ShipmentsPage = lazy(() => import("./pages/customer/ShipmentsPage").then((m) => ({ default: m.ShipmentsPage })));
const DriverDashboard = lazy(() => import("./pages/driver/DriverDashboard").then((m) => ({ default: m.DriverDashboard })));
const DriverJobsPage = lazy(() => import("./pages/driver/DriverJobsPage").then((m) => ({ default: m.DriverJobsPage })));
const DriverTruckPage = lazy(() => import("./pages/driver/DriverTruckPage").then((m) => ({ default: m.DriverTruckPage })));
const FtlMarketplacePage = lazy(() => import("./pages/driver/FtlMarketplacePage").then((m) => ({ default: m.FtlMarketplacePage })));
const SharedTripsPage = lazy(() => import("./pages/driver/SharedTripsPage").then((m) => ({ default: m.SharedTripsPage })));
const SharedTripFormPage = lazy(() => import("./pages/driver/SharedTripFormPage").then((m) => ({ default: m.SharedTripFormPage })));
const SharedTripDetailPage = lazy(() => import("./pages/driver/SharedTripDetailPage").then((m) => ({ default: m.SharedTripDetailPage })));
const SharedMarketplacePage = lazy(() => import("./pages/customer/SharedMarketplacePage").then((m) => ({ default: m.SharedMarketplacePage })));
const RequestBidsPage = lazy(() => import("./pages/customer/RequestBidsPage").then((m) => ({ default: m.RequestBidsPage })));
const DriverMyBidsPage = lazy(() => import("./pages/driver/DriverMyBidsPage").then((m) => ({ default: m.DriverMyBidsPage })));
const PostOpenRequestPage = lazy(() => import("./pages/customer/PostOpenRequestPage").then((m) => ({ default: m.PostOpenRequestPage })));
const TripsPage = lazy(() => import("./pages/shared/TripsPage").then((m) => ({ default: m.TripsPage })));
const NotificationsPage = lazy(() => import("./pages/shared/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const TrackingPage = lazy(() => import("./pages/shared/TrackingPage").then((m) => ({ default: m.TrackingPage })));
const PaymentsPage = lazy(() => import("./pages/shared/PaymentsPage").then((m) => ({ default: m.PaymentsPage })));
const EarningsPage = lazy(() => import("./pages/shared/EarningsPage").then((m) => ({ default: m.EarningsPage })));
const ProfilePage = lazy(() => import("./pages/shared/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const SupportPage = lazy(() => import("./pages/shared/SupportPage").then((m) => ({ default: m.SupportPage })));

function HomeRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated) return <Navigate to={roleHome(user.role)} replace />;
  return <LandingPage />;
}

export default function App() {
  return (
    <>
      <PwaUpdatePrompt />
      <InstallPwaBanner />
      <Suspense fallback={<div className="py-16 text-center text-sm text-on-surface-variant">Loading…</div>}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/trucks" element={<PublicTrucksPage />} />
          <Route path="/shared-loads" element={<Navigate to="/trucks" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/feedback/:token" element={<PublicFeedbackPage />} />
          <Route path="/f/:token" element={<PublicFeedbackPage />} />
          <Route path="/about" element={<PublicInfoPage />} />
          <Route path="/contact" element={<PublicInfoPage />} />
          <Route path="/help" element={<PublicInfoPage />} />
          <Route path="/faqs" element={<PublicInfoPage />} />
          <Route path="/terms" element={<PublicInfoPage />} />
          <Route path="/privacy" element={<PublicInfoPage />} />

          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="/admin" element={<DashboardLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="book" element={<AdminBookingPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="customers" element={<UsersPage mode="customers" />} />
              <Route path="requests" element={<RequestsPage />} />
              <Route path="trucks" element={<UsersPage mode="fleet" />} />
              <Route path="fleet-status" element={<TrucksPage />} />
              <Route path="trips" element={<TripsPage />} />
              <Route path="tracking" element={<TrackingPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="earnings" element={<EarningsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              <Route path="communication" element={<Navigate to="/admin/support" replace />} />
              <Route path="sms" element={<Navigate to="/admin/support" replace />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="/dispatcher/*" element={<Navigate to="/login" replace />} />

          <Route element={<ProtectedRoute roles={["customer"]} />}>
            <Route path="/customer" element={<DashboardLayout />}>
              <Route index element={<CustomerDashboard />} />
              <Route path="find-trucks" element={<BrowseTrucksPage />} />
              <Route path="book" element={<BookTruckPage />} />
              <Route path="post-request" element={<PostOpenRequestPage />} />
              <Route path="shared-marketplace" element={<SharedMarketplacePage />} />
              <Route path="shipments" element={<ShipmentsPage />} />
              <Route path="bids/:cargoRequestId" element={<RequestBidsPage />} />
              <Route path="trips" element={<ShipmentsPage />} />
              <Route path="tracking" element={<TrackingPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={["driver"]} />}>
            <Route path="/driver" element={<DashboardLayout />}>
              <Route path="requests" element={<RequestsPage />} />
              <Route index element={<DriverDashboard />} />
              <Route path="marketplace" element={<DriverServiceGuard allow="FTL"><FtlMarketplacePage /></DriverServiceGuard>} />
              <Route path="my-bids" element={<DriverServiceGuard allow="FTL"><DriverMyBidsPage /></DriverServiceGuard>} />
              <Route path="shared-trips" element={<DriverServiceGuard allow="SHARED"><SharedTripsPage /></DriverServiceGuard>} />
              <Route path="shared-trips/new" element={<DriverServiceGuard allow="SHARED"><SharedTripFormPage /></DriverServiceGuard>} />
              <Route path="shared-trips/:id/edit" element={<DriverServiceGuard allow="SHARED"><SharedTripFormPage /></DriverServiceGuard>} />
              <Route path="shared-trips/:id" element={<DriverServiceGuard allow="SHARED"><SharedTripDetailPage /></DriverServiceGuard>} />
              <Route path="jobs" element={<DriverJobsPage />} />
              <Route path="trips" element={<DriverJobsPage />} />
              <Route path="tracking" element={<TrackingPage />} />
              <Route path="truck" element={<DriverTruckPage />} />
              <Route path="earnings" element={<EarningsPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
