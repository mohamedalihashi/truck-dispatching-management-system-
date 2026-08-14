import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { money } from "../../utils/helpers";
import { CHART_COLORS } from "./dashboardChartUtils";

export function CustomerDashboardCharts({ statusData, trendData, totalTrips }) {
  const hasStatus = statusData?.length > 0;
  const pieData = hasStatus ? statusData : [{ name: "No trips", value: 1 }];

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-primary-container">Your activity</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Trips and deliveries over the last six months.
            </p>
          </div>
          <span className="rounded-full bg-secondary-container/10 px-3 py-1 text-xs font-semibold text-secondary-container">
            6-month trend
          </span>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData?.length ? trendData : [{ name: "—", trips: 0, delivered: 0 }]}>
              <defs>
                <linearGradient id="custTripsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fe6b00" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#fe6b00" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="custDeliveredFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#27ae60" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#27ae60" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#c5c6cd" />
              <XAxis dataKey="name" stroke="#75777e" />
              <YAxis allowDecimals={false} stroke="#75777e" />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="trips"
                name="Trips"
                stroke="#a04100"
                fill="url(#custTripsFill)"
                strokeWidth={2.5}
              />
              <Area
                type="monotone"
                dataKey="delivered"
                name="Delivered"
                stroke="#1e8449"
                fill="url(#custDeliveredFill)"
                strokeWidth={2.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-5">
        <div>
          <h2 className="text-xl font-semibold text-primary-container">Trip status</h2>
          <p className="mt-1 text-sm text-on-surface-variant">How your recent shipments are progressing.</p>
        </div>
        <div className="relative mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={62}
                outerRadius={88}
                paddingAngle={3}
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={hasStatus ? CHART_COLORS[index % CHART_COLORS.length] : "#c5c6cd"} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-primary-container">{totalTrips ?? 0}</span>
            <span className="text-xs text-on-surface-variant">Recent trips</span>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
          {(hasStatus ? statusData : []).map((row, index) => (
            <div key={row.name} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-2 text-on-surface-variant">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className="truncate">{row.name}</span>
              </span>
              <span className="font-bold text-primary-container">{row.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-12">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-primary-container">Spending overview</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Estimated fare totals by month from your trips.</p>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData?.length ? trendData : [{ name: "—", amount: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#c5c6cd" />
              <XAxis dataKey="name" stroke="#75777e" />
              <YAxis stroke="#75777e" />
              <Tooltip formatter={(value) => money(value)} />
              <Bar dataKey="amount" name="Fare" radius={[8, 8, 0, 0]} fill="#5979ff" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
