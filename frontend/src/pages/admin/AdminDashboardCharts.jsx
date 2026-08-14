import {
  CheckCircle2,
  FileText,
  Package
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
import { money } from "../../utils/helpers";

const COLORS = ["#fe6b00", "#0d1c32", "#5979ff", "#ba1a1a", "#27ae60"];

export function AdminDashboardCharts({
  growthData,
  revenueData,
  shipmentData,
  userRoleData,
  totalRoleUsers,
  stats,
  reports,
  recentActivity
}) {
  return (
    <>
      <div className="grid gap-6 xl:grid-cols-12">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-8">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-primary-container">Management system growth</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Bookings, trips, and deliveries over the last six months.
              </p>
            </div>
            <span className="rounded-full bg-secondary-container/10 px-3 py-1 text-xs font-semibold text-secondary-container">
              6-month trend
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
                <Line type="monotone" dataKey="requests" name="Bookings" stroke="#fe6b00" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="trips" name="Trips" stroke="#5979ff" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="delivered" name="Delivered" stroke="#27ae60" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-4">
          <div>
            <h2 className="text-xl font-semibold text-primary-container">Management system roles</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Customers and drivers on the platform (no dispatcher).</p>
          </div>
          <div className="relative mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={userRoleData.length ? userRoleData : [{ name: "None", value: 1 }]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={3}
                  stroke="none"
                >
                  {(userRoleData.length ? userRoleData : [{ name: "None", value: 1 }]).map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-primary-container">{totalRoleUsers || stats?.totalUsers || 0}</span>
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
              <span className="h-3 w-3 rounded-full bg-secondary" /> Last 6 months
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData.length ? revenueData : [{ name: "—", revenue: 0 }]}>
                <defs>
                  <linearGradient id="dashRevFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fe6b00" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#fe6b00" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#c5c6cd" />
                <XAxis dataKey="name" stroke="#75777e" />
                <YAxis stroke="#75777e" />
                <Tooltip formatter={(value) => money(value)} />
                <Area type="monotone" dataKey="revenue" stroke="#a04100" fill="url(#dashRevFill)" strokeWidth={2.5} />
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
                    <p className="text-xs font-medium text-emerald-600">Online</p>
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
                    <p className="font-semibold text-primary">Open requests</p>
                    <p className="text-xs text-on-surface-variant">
                      {reports?.overview?.openRequests ?? stats?.pendingOrders ?? 0} pending
                    </p>
                  </div>
                </div>
                <Link to="/admin/reports" className="text-sm font-semibold text-secondary hover:underline">
                  Reports
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
          <h2 className="mb-4 text-xl font-semibold text-primary-container">Trips Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shipmentData.length ? shipmentData : [{ name: "None", value: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#c5c6cd" />
                <XAxis dataKey="name" hide />
                <YAxis stroke="#75777e" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {(shipmentData.length ? shipmentData : [{ name: "None", value: 0 }]).map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {shipmentData.map((row, index) => (
              <span key={row.name} className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                {row.name}: {row.value}
              </span>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-7">
          <h2 className="mb-4 text-xl font-semibold text-primary-container">FTL vs Shared</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reports?.operations?.loadTypes?.length ? reports.operations.loadTypes : [{ name: "FTL", value: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#c5c6cd" />
                <XAxis dataKey="name" stroke="#75777e" />
                <YAxis allowDecimals={false} stroke="#75777e" />
                <Tooltip />
                <Bar dataKey="value" name="Requests" radius={[8, 8, 0, 0]} fill="#5979ff" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </>
  );
}
