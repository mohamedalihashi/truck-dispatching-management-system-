import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  CheckCircle2,
  Search,
  Star,
  TrendingUp,
  Truck,
  Wallet
} from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { api } from "../../services/api";
import { money } from "../../utils/helpers";
import { useUsers } from "../../hooks/useApi";

const COLORS = {
  orange: "#fe6b00",
  navy: "#0d1c32",
  blue: "#5979ff",
  green: "#27ae60",
  red: "#ba1a1a",
  teal: "#0d9488",
  amber: "#f59e0b",
  slate: "#64748b"
};

const PIE = [COLORS.orange, COLORS.navy, COLORS.blue, COLORS.green, COLORS.teal, COLORS.amber, COLORS.red];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "operations", label: "Operations" },
  { id: "performance", label: "Performance" },
  { id: "activity", label: "User Activity" }
];

const ACTIVITY_TYPES = [
  { value: "all", label: "All activity" },
  { value: "cargo", label: "Cargo" },
  { value: "trips", label: "Trips" },
  { value: "payments", label: "Payments" },
  { value: "trucks", label: "Trucks" },
  { value: "earnings", label: "Earnings" },
  { value: "shared", label: "Shared loads" },
  { value: "feedback", label: "Feedback" },
  { value: "audits", label: "Audit log" }
];

const AXIS = { stroke: "#94a3b8", fontSize: 12 };
const GRID = { stroke: "#e2e8f0", strokeDasharray: "4 6" };

function ChartTooltip({ active, payload, label, moneyKeys = [] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
      {label ? <p className="mb-1.5 text-xs font-semibold text-slate-500">{label}</p> : null}
      <ul className="space-y-1">
        {payload.map((item) => {
          const key = item.dataKey || item.name;
          const value = moneyKeys.includes(key) || moneyKeys.includes(item.name) ? money(item.value) : item.value;
          return (
            <li key={`${item.name}-${key}`} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color || item.fill }} />
              <span className="text-slate-500">{item.name}:</span>
              <span className="font-semibold text-slate-800">{value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ReportsPage() {
  const [tab, setTab] = useState("overview");
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["reports-summary"],
    queryFn: () => api.reportsSummary(),
    enabled: tab !== "activity"
  });

  const overview = data?.overview || {};
  const months = data?.trends?.months || [];
  const operations = data?.operations || {};
  const performance = data?.performance || {};

  const generatedLabel = useMemo(() => {
    if (!data?.generatedAt) return null;
    return new Date(data.generatedAt).toLocaleString();
  }, [data?.generatedAt]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Business Reports"
        subtitle="Revenue, operations, fleet performance, and full user activity."
        actions={
          tab !== "activity" ? (
            <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          ) : null
        }
      />

      {tab !== "activity" && generatedLabel ? (
        <p className="text-xs text-on-surface-variant">Last updated {generatedLabel}</p>
      ) : null}

      {tab !== "activity" && error ? (
        <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error.message}</p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-outline-variant pb-3">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === item.id
                ? "bg-secondary-container text-on-secondary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "activity" ? (
        <UserActivityTab />
      ) : isLoading ? (
        <p className="py-16 text-center text-sm text-on-surface-variant">Loading reports…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard icon={Wallet} label="Total collected" value={money(overview.totalRevenue)} tone="green" />
            <MetricCard icon={TrendingUp} label="This month" value={money(overview.monthRevenue)} tone="orange" />
            <MetricCard icon={Truck} label="Active trips" value={overview.activeTrips ?? 0} tone="blue" />
            <MetricCard
              icon={CheckCircle2}
              label="Completion rate"
              value={`${overview.completionRate ?? 0}%`}
              tone="navy"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat label="Open requests" value={overview.openRequests ?? 0} />
            <MiniStat label="Delivered trips" value={overview.deliveredTrips ?? 0} />
            <MiniStat label="Pending payments" value={overview.pendingPayments ?? 0} />
            <MiniStat
              label="Avg rating"
              value={overview.avgRating != null ? `${overview.avgRating}★` : "—"}
            />
          </div>

          {tab === "overview" ? <OverviewTab months={months} overview={overview} operations={operations} /> : null}
          {tab === "operations" ? <OperationsTab operations={operations} overview={overview} /> : null}
          {tab === "performance" ? <PerformanceTab performance={performance} overview={overview} /> : null}
        </>
      )}
    </div>
  );
}

function OverviewTab({ months, overview, operations }) {
  const loadData = operations.loadTypes?.length
    ? operations.loadTypes
    : [
        { name: "FTL", value: overview.ftlRequests || 0 },
        { name: "SHARED", value: overview.sharedRequests || 0 }
      ];

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <ChartCard
        className="xl:col-span-8"
        title="Revenue area chart"
        subtitle="Collected payments over the last 6 months."
        badge="Area"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={months} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.orange} stopOpacity={0.45} />
                <stop offset="55%" stopColor={COLORS.orange} stopOpacity={0.12} />
                <stop offset="100%" stopColor={COLORS.orange} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} />
            <Tooltip content={<ChartTooltip moneyKeys={["revenue", "Revenue"]} />} />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke={COLORS.orange}
              fill="url(#revFill)"
              strokeWidth={3}
              activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="xl:col-span-4"
        title="Load mix"
        subtitle="FTL vs SHARED request share."
        badge="Donut"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={loadData.some((d) => d.value > 0) ? loadData : [{ name: "No data", value: 1 }]}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={4}
              cornerRadius={6}
              stroke="none"
            >
              {loadData.map((entry, index) => (
                <Cell key={entry.name} fill={PIE[index % PIE.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend verticalAlign="bottom" height={28} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="xl:col-span-6"
        title="Delivery line chart"
        subtitle="Delivered trips month by month."
        badge="Line"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={months} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="delivered"
              name="Delivered"
              stroke={COLORS.green}
              strokeWidth={3}
              dot={{ r: 4, fill: COLORS.green, strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 7 }}
            />
            <Line
              type="monotone"
              dataKey="trips"
              name="Trips started"
              stroke={COLORS.navy}
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={{ r: 3, fill: COLORS.navy }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="xl:col-span-6"
        title="Request volume bars"
        subtitle="New requests vs trips opened."
        badge="Bar"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} barGap={6} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="reqBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.blue} stopOpacity={1} />
                <stop offset="100%" stopColor={COLORS.blue} stopOpacity={0.65} />
              </linearGradient>
              <linearGradient id="tripBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.navy} stopOpacity={1} />
                <stop offset="100%" stopColor={COLORS.navy} stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <Bar dataKey="requests" name="Requests" fill="url(#reqBar)" radius={[10, 10, 4, 4]} maxBarSize={36} />
            <Bar dataKey="trips" name="Trips" fill="url(#tripBar)" radius={[10, 10, 4, 4]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="xl:col-span-12"
        title="Combined performance"
        subtitle="Area revenue + bar requests + line deliveries in one view."
        badge="Composed"
        height="h-80"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={months} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="compFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.orange} stopOpacity={0.28} />
                <stop offset="100%" stopColor={COLORS.orange} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={AXIS} axisLine={false} tickLine={false} width={48} />
            <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<ChartTooltip moneyKeys={["revenue", "Revenue"]} />} />
            <Legend />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              fill="url(#compFill)"
              stroke={COLORS.orange}
              strokeWidth={2.5}
            />
            <Bar
              yAxisId="right"
              dataKey="requests"
              name="Requests"
              fill={COLORS.blue}
              radius={[8, 8, 0, 0]}
              maxBarSize={28}
              opacity={0.85}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="delivered"
              name="Delivered"
              stroke={COLORS.green}
              strokeWidth={3}
              dot={{ r: 4, fill: COLORS.green, stroke: "#fff", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function OperationsTab({ operations, overview }) {
  const tripStatus = operations.tripStatus || [];
  const truckStatus = operations.truckStatus || [];
  const paymentStatus = operations.paymentStatus || [];
  const requestStatus = operations.requestStatus || [];
  const topRoutes = operations.topRoutes || [];

  const completionGauge = [
    {
      name: "Completion",
      value: overview.completionRate ?? 0,
      fill: COLORS.green
    }
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <ChartCard className="xl:col-span-4" title="Trip pipeline" subtitle="Live trip status mix." badge="Donut">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={tripStatus.length ? tripStatus : [{ name: "None", value: 1 }]}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={88}
              paddingAngle={3}
              cornerRadius={5}
              stroke="none"
            >
              {tripStatus.map((entry, index) => (
                <Cell key={entry.name} fill={PIE[index % PIE.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard className="xl:col-span-4" title="Fleet bars" subtitle="Truck availability." badge="Bar">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={truckStatus} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID} vertical={false} />
            <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="value" name="Trucks" radius={[10, 10, 4, 4]} maxBarSize={48}>
              {truckStatus.map((entry, index) => (
                <Cell key={entry.name} fill={PIE[index % PIE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard className="xl:col-span-4" title="Completion gauge" subtitle="Delivered vs cancelled share." badge="Radial">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="58%"
            outerRadius="100%"
            data={completionGauge}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              background={{ fill: "#e2e8f0" }}
              dataKey="value"
              cornerRadius={12}
              clockWise
            />
            <text
              x="50%"
              y="48%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-800 text-3xl font-bold"
            >
              {overview.completionRate ?? 0}%
            </text>
            <text
              x="50%"
              y="62%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-500 text-xs"
            >
              completion
            </text>
          </RadialBarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="xl:col-span-7"
        title="Payment collection"
        subtitle="Horizontal bars by payment status."
        badge="Bar"
        height="h-72"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={paymentStatus} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="payBar" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={COLORS.green} stopOpacity={0.75} />
                <stop offset="100%" stopColor={COLORS.teal} stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={78} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload;
                return (
                  <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg">
                    <p className="text-xs font-semibold text-slate-500">{label}</p>
                    <p className="text-sm font-semibold text-slate-800">{row?.value} payments</p>
                    <p className="text-sm text-slate-600">{money(row?.amount)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" name="Payments" fill="url(#payBar)" radius={[0, 10, 10, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="xl:col-span-5"
        title="Request status line"
        subtitle="Where cargo requests sit in the workflow."
        badge="Line"
        height="h-72"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={requestStatus} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} angle={-18} textAnchor="end" height={50} interval={0} />
            <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              name="Requests"
              stroke={COLORS.blue}
              strokeWidth={3}
              dot={{ r: 5, fill: COLORS.blue, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="xl:col-span-12"
        title="Top corridors"
        subtitle="Most completed pickup → destination routes."
        badge="Bar"
        height="h-72"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={topRoutes} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="routeBar" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={COLORS.navy} stopOpacity={0.85} />
                <stop offset="100%" stopColor={COLORS.orange} stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="route"
              width={180}
              tick={{ ...AXIS, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="trips" name="Deliveries" fill="url(#routeBar)" radius={[0, 10, 10, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-12">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Route details</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Table view of the same corridor data.</p>
        </div>
        <DataTable
          rows={topRoutes}
          empty="No delivered routes yet."
          columns={[
    { key: "route", label: "Route" },
            { key: "trips", label: "Deliveries" }
          ]}
        />
      </section>
    </div>
  );
}

function PerformanceTab({ performance, overview }) {
  const drivers = performance.drivers || [];
  const ratings = (performance.ratingDistribution || []).map((row) => ({
    ...row,
    label: `${row.rating}★`
  }));

  const ratingAvgGauge = [
    {
      name: "Avg rating",
      value: overview.avgRating != null ? overview.avgRating * 20 : 0,
      fill: COLORS.amber
    }
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <ChartCard
        className="xl:col-span-7"
        title="Driver trips & fares"
        subtitle="Grouped bars for top drivers."
        badge="Bar"
        height="h-80"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={drivers} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}>
            <CartesianGrid {...GRID} vertical={false} />
            <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={60} interval={0} />
            <YAxis yAxisId="left" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={36} />
            <YAxis yAxisId="right" orientation="right" tick={AXIS} axisLine={false} tickLine={false} width={48} />
            <Tooltip content={<ChartTooltip moneyKeys={["earnings", "Trip fares"]} />} />
            <Legend />
            <Bar yAxisId="left" dataKey="completedTrips" name="Completed trips" fill={COLORS.navy} radius={[8, 8, 0, 0]} maxBarSize={28} />
            <Bar yAxisId="right" dataKey="earnings" name="Trip fares" fill={COLORS.orange} radius={[8, 8, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="xl:col-span-5"
        title="Rating distribution"
        subtitle="Customer star scores as an area wave."
        badge="Area"
        height="h-80"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={ratings} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.amber} stopOpacity={0.5} />
                <stop offset="100%" stopColor={COLORS.amber} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              name="Reviews"
              stroke={COLORS.amber}
              fill="url(#ratingFill)"
              strokeWidth={3}
              activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="xl:col-span-4"
        title="Average rating"
        subtitle="Platform feedback score (out of 5)."
        badge="Radial"
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="58%"
            outerRadius="100%"
            data={ratingAvgGauge}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar background={{ fill: "#e2e8f0" }} dataKey="value" cornerRadius={12} clockWise />
            <text
              x="50%"
              y="48%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-800 text-3xl font-bold"
            >
              {overview.avgRating != null ? overview.avgRating : "—"}
            </text>
            <text
              x="50%"
              y="62%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-500 text-xs"
            >
              avg stars
            </text>
          </RadialBarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        className="xl:col-span-12"
        title="Driver earnings line"
        subtitle="Fare trend across the leaderboard."
        badge="Line"
        height="h-64"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={drivers} margin={{ top: 8, right: 16, left: 0, bottom: 36 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} angle={-18} textAnchor="end" height={50} interval={0} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} />
            <Tooltip content={<ChartTooltip moneyKeys={["earnings", "Fares"]} />} />
            <Line
              type="monotone"
              dataKey="earnings"
              name="Fares"
              stroke={COLORS.orange}
              strokeWidth={3}
              dot={{ r: 4, fill: COLORS.orange, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 7 }}
            />
            <Line
              type="monotone"
              dataKey="rating"
              name="Rating"
              stroke={COLORS.amber}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] xl:col-span-12">
        <div className="flex items-center gap-2 border-b border-outline-variant px-6 py-5">
          <Truck size={18} className="text-secondary-container" />
          <h2 className="text-xl font-semibold text-primary-container">Driver leaderboard</h2>
        </div>
        <DataTable
          rows={drivers}
          empty="No driver performance data yet."
          columns={[
            { key: "name", label: "Driver" },
            { key: "completedTrips", label: "Completed" },
            {
              key: "earnings",
              label: "Fares",
              render: (row) => money(row.earnings)
            },
            {
              key: "rating",
              label: "Rating",
              render: (row) =>
                row.rating ? (
                  <span className="inline-flex items-center gap-1">
                    <Star size={14} className="fill-amber-400 text-amber-400" /> {row.rating}
                  </span>
                ) : (
                  "—"
                )
            }
          ]}
        />
      </section>
    </div>
  );
}

function UserActivityTab() {
  const [userId, setUserId] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [activityType, setActivityType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detailTab, setDetailTab] = useState("timeline");

  const { data: usersData } = useUsers({
    role: roleFilter || undefined,
    search: userSearch || undefined,
    limit: 100
  });
  const users = usersData?.data || [];

  const queryEnabled = Boolean(userId);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["user-activity-report", userId, activityType, from, to],
    queryFn: () =>
      api.userActivityReport({
        userId,
        activityType,
        from: from || undefined,
        to: to || undefined,
        limit: 300
      }),
    enabled: queryEnabled
  });

  const summary = data?.summary || {};
  const user = data?.user;
  const chart = data?.chart || [];

  const detailSections = [
    { id: "timeline", label: "Timeline", rows: data?.timeline || [] },
    { id: "cargo", label: "Cargo", rows: data?.cargo || [] },
    { id: "trips", label: "Trips", rows: data?.trips || [] },
    { id: "payments", label: "Payments", rows: data?.payments || [] },
    { id: "trucks", label: "Trucks", rows: data?.trucks || [] },
    { id: "earnings", label: "Earnings", rows: data?.earnings || [] },
    { id: "shared", label: "Shared", rows: [...(data?.sharedTrips || []), ...(data?.sharedBookings || [])] },
    { id: "feedback", label: "Feedback", rows: data?.feedback || [] },
    { id: "audits", label: "Audits", rows: data?.audits || [] }
  ];

  const activeSection = detailSections.find((section) => section.id === detailTab) || detailSections[0];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="mb-4 flex items-center gap-2">
          <Search size={18} className="text-secondary-container" />
          <h2 className="text-lg font-semibold text-primary-container">Filter user activity</h2>
          </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="block text-sm xl:col-span-1">
            <span className="mb-1 block text-xs font-medium text-on-surface-variant">Role</span>
            <select
              className="stitch-input w-full"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setUserId("");
              }}
            >
              <option value="">All roles</option>
              <option value="customer">Customer</option>
              <option value="driver">Driver</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="block text-sm xl:col-span-1">
            <span className="mb-1 block text-xs font-medium text-on-surface-variant">Search users</span>
            <input
              className="stitch-input w-full"
              placeholder="Name, email, phone…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </label>
          <label className="block text-sm xl:col-span-2">
            <span className="mb-1 block text-xs font-medium text-on-surface-variant">User</span>
            <select className="stitch-input w-full" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {users.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.role}
                  {row.email ? ` · ${row.email}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-on-surface-variant">Activity type</span>
            <select
              className="stitch-input w-full"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
            >
              {ACTIVITY_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">From</span>
              <input className="stitch-input w-full" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">To</span>
              <input className="stitch-input w-full" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => refetch()} disabled={!userId || isFetching}>
            {isFetching ? "Loading…" : "Generate report"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setUserId("");
              setActivityType("all");
              setFrom("");
              setTo("");
              setUserSearch("");
              setRoleFilter("");
              setDetailTab("timeline");
            }}
          >
            Clear
          </Button>
        </div>
      </section>

      {!userId ? (
        <p className="rounded-xl border border-dashed border-outline-variant px-6 py-16 text-center text-sm text-on-surface-variant">
          Select a user to see cargo, trips, payments, trucks, earnings, shared loads, feedback, and audit history.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error.message}</p>
      ) : null}

      {userId && isLoading ? (
        <p className="py-12 text-center text-sm text-on-surface-variant">Loading user activity…</p>
      ) : null}

      {user ? (
        <>
          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-primary-container">{user.name}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {user.role}
                  {user.serviceType ? ` · ${user.serviceType}` : ""} · {user.email || "no email"}
                  {user.phone ? ` · ${user.phone}` : ""}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Status: {user.status} · Joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                </p>
          </div>
              {user.truckNumber ? (
                <div className="rounded-lg bg-surface-container px-3 py-2 text-sm">
                  <p className="font-semibold text-on-surface">Truck {user.truckNumber}</p>
                  <p className="text-xs text-on-surface-variant">
                    {user.plateNumber || "—"} · {user.truckStatus || "—"}
                  </p>
          </div>
              ) : null}
        </div>
      </section>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
            <MiniStat label="Cargo" value={summary.cargo ?? 0} />
            <MiniStat label="Trips" value={summary.trips ?? 0} />
            <MiniStat label="Payments" value={summary.payments ?? 0} />
            <MiniStat label="Trucks" value={summary.trucks ?? 0} />
            <MiniStat label="Earnings" value={money(summary.earnedAmount)} />
            <MiniStat label="Paid amount" value={money(summary.paidAmount)} />
            <MiniStat label="Shared trips" value={summary.sharedTrips ?? 0} />
            <MiniStat label="Feedback" value={summary.feedback ?? 0} />
            <MiniStat label="Audits" value={summary.audits ?? 0} />
          </div>

          <ChartCard
            title="Activity over time"
            subtitle="Daily activity volume for the selected filters."
            badge="Bar"
            height="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.length ? chart : [{ period: "—", activities: 0 }]}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="period" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="activities" name="Activities" fill={COLORS.orange} radius={[8, 8, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="flex flex-wrap gap-2">
            {detailSections.map((section) => (
          <button
                key={section.id}
            type="button"
                onClick={() => setDetailTab(section.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  detailTab === section.id
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {section.label} ({section.rows.length})
          </button>
        ))}
      </div>

          <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
            <div className="border-b border-outline-variant px-6 py-4">
              <h2 className="text-lg font-semibold text-primary-container">{activeSection.label}</h2>
          </div>
            <ActivityDetailTable sectionId={activeSection.id} rows={activeSection.rows} />
        </section>
        </>
      ) : null}
    </div>
  );
}

function ActivityDetailTable({ sectionId, rows }) {
  if (sectionId === "timeline") {
    return (
      <DataTable
        rows={rows}
        empty="No activity found for these filters."
        columns={[
          {
            key: "createdAt",
            label: "When",
            render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "—")
          },
          {
            key: "type",
            label: "Type",
            render: (row) => <span className="capitalize">{row.type}</span>
          },
          { key: "title", label: "Activity" },
          { key: "detail", label: "Details" },
          {
            key: "amount",
            label: "Amount",
            render: (row) => (row.amount != null ? money(row.amount) : "—")
          },
          {
            key: "status",
            label: "Status",
            render: (row) => (row.status ? <StatusBadge status={row.status} /> : "—")
          }
        ]}
      />
    );
  }

  if (sectionId === "cargo") {
    return (
      <DataTable
        rows={rows}
        empty="No cargo requests."
        columns={[
          { key: "id", label: "Request" },
          {
            key: "route",
            label: "Route",
            render: (row) => `${row.pickup} → ${row.destination}`
          },
          { key: "loadType", label: "Load" },
          { key: "weight", label: "Weight" },
          { key: "status", label: "Status", type: "status" },
          {
            key: "createdAt",
            label: "Created",
            render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "—")
          }
        ]}
      />
    );
  }

  if (sectionId === "trips") {
    return (
      <DataTable
        rows={rows}
        empty="No trips."
        columns={[
          { key: "id", label: "Trip" },
          {
            key: "route",
            label: "Route",
            render: (row) => `${row.pickup} → ${row.destination}`
          },
          { key: "driver", label: "Driver" },
          { key: "customer", label: "Customer" },
          {
            key: "fare",
            label: "Fare",
            render: (row) => money(row.fare)
          },
          { key: "status", label: "Status", type: "status" }
        ]}
      />
    );
  }

  if (sectionId === "payments") {
    return (
      <DataTable
        rows={rows}
        empty="No payments."
        columns={[
          { key: "referenceId", label: "Reference" },
          { key: "route", label: "Trip / route" },
          {
            key: "amount",
            label: "Amount",
            render: (row) => money(row.amount)
          },
          {
            key: "amountPaid",
            label: "Paid",
            render: (row) => money(row.amountPaid)
          },
          { key: "method", label: "Method" },
          { key: "status", label: "Status", type: "status" }
        ]}
      />
    );
  }

  if (sectionId === "trucks") {
    return (
      <DataTable
        rows={rows}
        empty="No trucks."
        columns={[
          { key: "truckNumber", label: "Truck" },
          { key: "plateNumber", label: "Plate" },
          { key: "truckType", label: "Type" },
          { key: "capacity", label: "Capacity" },
          { key: "status", label: "Status", type: "status" },
          { key: "city", label: "City" }
        ]}
      />
    );
  }

  if (sectionId === "earnings") {
    return (
      <DataTable
        rows={rows}
        empty="No earnings."
        columns={[
          { key: "tripId", label: "Trip" },
          {
            key: "amount",
            label: "Amount",
            render: (row) => money(row.amount)
          },
          { key: "percent", label: "%" },
          { key: "recipientRole", label: "Role" },
          { key: "status", label: "Status", type: "status" },
          {
            key: "createdAt",
            label: "Created",
            render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "—")
          }
        ]}
      />
    );
  }

  if (sectionId === "shared") {
    return (
      <DataTable
        rows={rows}
        empty="No shared trips or bookings."
        columns={[
          {
            key: "kind",
            label: "Kind",
            render: (row) => (row.weightTons != null ? "Booking" : "Trip")
          },
          {
            key: "route",
            label: "Route",
            render: (row) => row.route || (row.pickup ? `${row.pickup} → ${row.destination}` : "—")
          },
          {
            key: "capacity",
            label: "Tons / price",
            render: (row) =>
              row.weightTons != null
                ? `${row.weightTons} tons`
                : `${row.availableTons ?? 0}/${row.totalCapacityTons ?? 0} · ${row.pricePerTon != null ? money(row.pricePerTon) : "—"}`
          },
          { key: "status", label: "Status", type: "status" },
          {
            key: "createdAt",
            label: "Created",
            render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "—")
          }
        ]}
      />
    );
  }

  if (sectionId === "feedback") {
    return (
      <DataTable
        rows={rows}
        empty="No feedback."
        columns={[
          { key: "route", label: "Route" },
          {
            key: "rating",
            label: "Rating",
            render: (row) => (
              <span className="inline-flex items-center gap-1">
                <Star size={14} className="fill-amber-400 text-amber-400" /> {row.rating}
              </span>
            )
          },
          { key: "comment", label: "Comment" },
          { key: "customer", label: "Customer" },
          { key: "driver", label: "Driver" },
          {
            key: "createdAt",
            label: "Created",
            render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "—")
          }
        ]}
      />
    );
  }

  return (
    <DataTable
      rows={rows}
      empty="No audit events."
      columns={[
        {
          key: "createdAt",
          label: "When",
          render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "—")
        },
        { key: "action", label: "Action" },
        { key: "entity", label: "Entity" },
        { key: "entityId", label: "Entity ID" },
        { key: "description", label: "Description" },
        { key: "status", label: "Status", type: "status" }
      ]}
    />
  );
}

function ChartCard({ title, subtitle, children, className = "", height = "h-72", badge }) {
  return (
    <section
      className={`rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-primary-container">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p> : null}
        </div>
        {badge ? (
          <span className="shrink-0 rounded-md bg-secondary-container/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-secondary-container">
            {badge}
          </span>
        ) : null}
      </div>
      <div className={height}>{children}</div>
      </section>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
      <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-1 text-xl font-bold text-on-surface">{value}</p>
    </div>
  );
}
