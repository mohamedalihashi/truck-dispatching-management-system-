import { lazy, Suspense } from "react";
import {
  CheckCircle2,
  ClipboardList,
  MapPin,
  Package,
  Star,
  Truck,
  Users,
  Wallet
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { DataTable } from "../../components/ui/DataTable";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import {
  useDashboardSummary,
  useReportsSummary,
} from "../../hooks/useApi";
import { money } from "../../utils/helpers";
import { TripFeedbackPanel, StarRatingDisplay } from "../../components/TripFeedbackPanel";
import { useLanguage } from "../../contexts/LanguageContext";

const AdminDashboardCharts = lazy(() =>
  import("./AdminDashboardCharts").then((module) => ({ default: module.AdminDashboardCharts }))
);

function ChartsSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="h-72 animate-pulse rounded-xl bg-surface-container-low xl:col-span-8" />
        <div className="h-72 animate-pulse rounded-xl bg-surface-container-low xl:col-span-4" />
      </div>
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="h-80 animate-pulse rounded-xl bg-surface-container-low xl:col-span-8" />
        <div className="h-80 animate-pulse rounded-xl bg-surface-container-low xl:col-span-4" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-container-low xl:col-span-5" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-container-low xl:col-span-7" />
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: reports } = useReportsSummary();
  const stats = summary?.stats;
  const trips = summary?.recentTrips;
  const feedback = summary?.recentFeedback;
  const drivers = summary?.recentDrivers;
  const recentActivity = summary?.recentAudit?.data || [];

  const months = reports?.trends?.months || [];
  const growthData = months.map((row) => ({
    name: row.label,
    requests: row.requests,
    trips: row.trips,
    delivered: row.delivered
  }));
  const revenueData = months.map((row) => ({
    name: row.label,
    revenue: row.revenue
  }));
  const shipmentData = reports?.operations?.tripStatus || [];
  const userRoleData = [
    { name: "Customers", value: Number(stats?.totalCustomers || 0) },
    { name: "FTL drivers", value: Number(stats?.ftlDrivers || 0) },
    { name: "Shared drivers", value: Number(stats?.sharedDrivers || 0) }
  ].filter((row) => row.value > 0);
  const totalRoleUsers = userRoleData.reduce((total, row) => total + row.value, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Management System Control Center"
        subtitle="Customers submit cargo requests — assign FTL drivers, oversee shared loads, and manage payouts."
        actions={
          <>
            <Link to="/admin/trucks">
              <Button variant="secondary">Fleet & drivers</Button>
            </Link>
            <Link to="/admin/reports">
              <Button variant="secondary">View reports</Button>
            </Link>
            <Link to="/admin/audit-logs">
              <Button>Audit logs</Button>
            </Link>
          </>
        }
      />

      <div className="rounded-xl border border-secondary-container/30 bg-secondary-container/10 px-4 py-3 text-sm text-on-surface">
        Management system mode is active: customers submit requests; admin assigns FTL drivers below.
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <MetricCard icon={Users} label="Customers" value={stats?.totalCustomers ?? "—"} tone="blue" />
        <MetricCard icon={Truck} label="Drivers" value={stats?.totalDrivers ?? "—"} tone="navy" />
        <MetricCard icon={Wallet} label="Revenue" value={money(stats?.revenue)} tone="green" />
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <MetricCard icon={Truck} label="Available trucks" value={stats?.availableTrucks ?? "—"} tone="soft" />
        <MetricCard icon={Package} label="Open shared loads" value={stats?.openSharedTrips ?? "—"} tone="blue" />
        <MetricCard icon={ClipboardList} label="Pending requests" value={stats?.pendingOrders ?? "—"} tone="soft" />
      </div>

      <Suspense fallback={<ChartsSkeleton />}>
        <AdminDashboardCharts
          growthData={growthData}
          revenueData={revenueData}
          shipmentData={shipmentData}
          userRoleData={userRoleData}
          totalRoleUsers={totalRoleUsers}
          stats={stats}
          reports={reports}
          recentActivity={recentActivity}
        />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-3">
        <QuickStat icon={MapPin} label="Live trips" value={stats?.liveTrips ?? 0} />
        <QuickStat icon={ClipboardList} label="Today's bookings" value={stats?.todaysOrders ?? 0} />
        <QuickStat icon={CheckCircle2} label="Delivered" value={stats?.completedOrders ?? 0} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <QuickLink to="/admin/requests" title="Customer requests" text="View all requests and assign drivers" />
        <QuickLink to="/admin/trucks" title="Fleet / Drivers" text="Verify FTL & shared drivers" />
        <QuickLink to="/admin/trips" title="Trips" text="Monitor trip status" />
        <QuickLink to="/admin/earnings" title="Payouts" text="Pay drivers after customer payment" />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-6 py-5">
            <h2 className="text-xl font-semibold text-primary-container">Recent drivers</h2>
            <Link to="/admin/trucks" className="text-sm font-semibold text-secondary-container hover:underline">
              Manage fleet
            </Link>
          </div>
          <DataTable
            rows={drivers?.data || []}
            columns={[
              { key: "name", label: "Driver" },
              {
                key: "serviceType",
                label: "Service",
                render: (row) => row.serviceType || "FTL"
              },
              { key: "truckNumber", label: "Truck ID" },
              {
                key: "truckStatus",
                label: "Truck status",
                render: (row) => <StatusBadge status={row.truckStatus || "—"} />
              },
              {
                key: "status",
                label: "Account",
                render: (row) => <StatusBadge status={row.status || "—"} />
              }
            ]}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-6 py-5">
            <h2 className="text-xl font-semibold text-primary-container">Recent trips</h2>
            <Link to="/admin/trips" className="text-sm font-semibold text-secondary-container hover:underline">
              All trips
            </Link>
          </div>
          <DataTable
            rows={trips?.data || []}
            columns={[
              { key: "id", label: "Trip" },
              {
                key: "route",
                label: "Route",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              { key: "status", label: "Status", type: "status" },
              { key: "driver", label: "Driver" },
              { key: "customer", label: "Customer" },
              {
                key: "feedback",
                label: "Feedback",
                render: (row) =>
                  row.feedback ? (
                    <div className="space-y-1 text-xs">
                      <div>
                        Delivery: <StarRatingDisplay value={row.feedback.rating} size={12} />
                      </div>
                      {row.feedback.productRating ? (
                        <div>
                          Goods: <StarRatingDisplay value={row.feedback.productRating} size={12} />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-on-surface-variant">—</span>
                  )
              }
            ]}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-12">
          <div className="border-b border-outline-variant px-6 py-5">
            <div className="flex items-center gap-2">
              <Star size={20} className="text-amber-500" />
              <h2 className="text-xl font-semibold text-primary-container">Customer feedback</h2>
            </div>
            <p className="mt-1 text-sm text-on-surface-variant">
              Ratings customers leave after delivery on GaariHel
            </p>
          </div>
          <div className="p-6">
            <TripFeedbackPanel
              items={feedback?.data || []}
              summary={feedback?.summary}
              loading={summaryLoading}
              showDriver
              showCustomer
              limit={10}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
      <Icon className="text-secondary-container" />
      <div>
        <p className="text-xs uppercase tracking-wide text-on-surface-variant">{label}</p>
        <p className="text-xl font-bold text-primary">{value}</p>
      </div>
    </div>
  );
}

function QuickLink({ to, title, text }) {
  const { t } = useLanguage();
  return (
    <Link
      to={to}
      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] transition hover:border-secondary-container/40 hover:bg-surface-container-low"
    >
      <p className="font-semibold text-primary">{t(title)}</p>
      <p className="mt-1 text-sm text-on-surface-variant">{t(text)}</p>
    </Link>
  );
}
