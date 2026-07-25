import {
  CheckCircle2,
  FileText,
  MapPin,
  Package,
  Star,
  Truck,
  Users,
  Wallet
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { DataTable } from "../../components/ui/DataTable";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { useAuditLogs, useDashboard, useDashboardAnalytics, useReports, useTripFeedback, useTrips, useUsers } from "../../hooks/useApi";
import { money } from "../../utils/helpers";
import { TripFeedbackPanel, StarRatingDisplay } from "../../components/TripFeedbackPanel";

const COLORS = ["#fe6b00", "#0d1c32", "#5979ff", "#ba1a1a", "#27ae60"];

export function AdminDashboard() {
  const { data: stats } = useDashboard();
  const { data: analytics } = useDashboardAnalytics();
  const { data: reports } = useReports("monthly");
  const { data: trips } = useTrips({ limit: 8 });
  const { data: feedback, isLoading: feedbackLoading } = useTripFeedback({ limit: 10 });
  const { data: drivers } = useUsers({ role: "driver", limit: 8 });
  const { data: audit } = useAuditLogs();
  const recentActivity = (audit?.data || []).slice(0, 5);

  const revenueData = (reports?.revenue?.data || []).map((row) => ({
    name: row.label,
    revenue: row.revenue
  }));
  const shipmentData = reports?.shipments?.data || [];
  const growthData = analytics?.growth || [];
  const userRoleData = analytics?.userRoles || [];
  const totalRoleUsers = userRoleData.reduce((total, row) => total + Number(row.value || 0), 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin Control Center"
        subtitle="Real-time overview of fleet operations and truck dispatch metrics."
        actions={
          <>
            <Link to="/admin/reports">
              <Button variant="secondary">View reports</Button>
            </Link>
            <Link to="/admin/audit-logs">
              <Button>Audit logs</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Users} label="Total Users" value={stats?.totalUsers ?? "—"} tone="orange" />
        <MetricCard icon={Truck} label="Total Trucks" value={stats?.totalTrucks ?? "—"} tone="blue" />
        <MetricCard icon={Users} label="Active Drivers" value={stats?.totalDrivers ?? "—"} tone="navy" />
        <MetricCard icon={Wallet} label="Total Revenue" value={money(stats?.revenue)} tone="green" />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-8">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-primary-container">Growth Overview</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Users, cargo requests, and trips during the last three months.</p>
            </div>
            <span className="rounded-full bg-secondary-container/10 px-3 py-1 text-xs font-semibold text-secondary-container">
              3-month trend
            </span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#c5c6cd" />
                <XAxis dataKey="name" stroke="#75777e" />
                <YAxis allowDecimals={false} stroke="#75777e" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="users" name="Users" stroke="#fe6b00" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="requests" name="Cargo requests" stroke="#5979ff" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="trips" name="Trips" stroke="#27ae60" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-4">
          <div>
            <h2 className="text-xl font-semibold text-primary-container">User Roles</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Distribution of users across the platform.</p>
          </div>
          <div className="relative mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={userRoleData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={3}
                  stroke="none"
                >
                  {userRoleData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-primary-container">{totalRoleUsers}</span>
              <span className="text-xs text-on-surface-variant">Total users</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {userRoleData.map((row, index) => (
              <div key={row.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-on-surface-variant">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="font-bold text-primary-container">{row.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-primary-container">Revenue Overview</h2>
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <span className="h-3 w-3 rounded-full bg-secondary" /> Last 30 Days
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData.length ? revenueData : [{ name: "Week 1", revenue: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#c5c6cd" />
                <XAxis dataKey="name" stroke="#75777e" />
                <YAxis stroke="#75777e" />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#a04100" fill="#ffdbcc" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="space-y-6 xl:col-span-4">
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
            <h2 className="mb-4 text-xl font-semibold text-primary-container">System Health</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-primary">Server Status</p>
                    <p className="text-xs font-medium text-emerald-600">99.9% Uptime</p>
                  </div>
                </div>
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                    <FileText size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-primary">Support Tickets</p>
                    <p className="text-xs text-on-surface-variant">12 Active Tickets</p>
                  </div>
                </div>
                <Link to="/admin/users" className="text-sm font-semibold text-secondary hover:underline">
                  Manage users
                </Link>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
            <h2 className="mb-4 text-xl font-semibold text-primary-container">Recent Activity</h2>
            <div className="relative space-y-5 before:absolute before:bottom-2 before:left-[19px] before:top-2 before:w-[2px] before:bg-outline-variant/40">
              {recentActivity.length ? (
                recentActivity.map((entry) => (
                  <div key={entry.id} className="relative flex gap-4">
                    <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-white">
                      <Package size={16} />
                    </div>
                    <div>
                      <p className="text-sm text-on-surface">
                        {entry.actor} — {entry.action} {entry.entity} {entry.entityId}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ""}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-on-surface-variant">No recent audit events.</p>
              )}
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-5">
          <h2 className="mb-4 text-xl font-semibold text-primary-container">Shipments Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shipmentData.length ? shipmentData : [{ name: "None", value: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#c5c6cd" />
                <XAxis dataKey="name" hide />
                <YAxis stroke="#75777e" />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {(shipmentData.length ? shipmentData : [{ name: "None", value: 0 }]).map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-7">
          <div className="border-b border-outline-variant px-6 py-5">
            <h2 className="text-xl font-semibold text-primary-container">Top Performing Drivers</h2>
          </div>
          <DataTable
            rows={drivers?.data || []}
            columns={[
              { key: "name", label: "Driver" },
              { key: "truckNumber", label: "Truck" },
              {
                key: "truckStatus",
                label: "Status",
                render: (row) => <StatusBadge status={row.truckStatus || "—"} />
              },
              { key: "email", label: "Email" }
            ]}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-12">
          <div className="border-b border-outline-variant px-6 py-5">
            <h2 className="text-xl font-semibold text-primary-container">Recent Trips</h2>
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
              <h2 className="text-xl font-semibold text-primary-container">Customer Feedback</h2>
            </div>
            <p className="mt-1 text-sm text-on-surface-variant">All ratings on delivered goods across the platform</p>
          </div>
          <div className="p-6">
            <TripFeedbackPanel
              items={feedback?.data || []}
              summary={feedback?.summary}
              loading={feedbackLoading}
              showDriver
              showCustomer
              limit={10}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <QuickStat icon={MapPin} label="Live trips" value={stats?.liveTrips ?? 0} />
        <QuickStat icon={FileText} label="Today's orders" value={stats?.todaysOrders ?? 0} />
        <QuickStat icon={CheckCircle2} label="Completed" value={stats?.completedOrders ?? 0} />
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
