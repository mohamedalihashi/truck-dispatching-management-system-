import { useMemo, useState } from "react";
import { Download, Printer, RotateCcw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { useCargoRequests, useDeliveryFeedbackReport, useEarnings, usePayments, useTrips, useTrucks } from "../../hooks/useApi";
import { money } from "../../utils/helpers";

const TABS = [
  { id: "rankings", label: "Rankings" },
  { id: "requests", label: "Requests" },
  { id: "trips", label: "Trips" },
  { id: "payments", label: "Payments" },
  { id: "earnings", label: "Earnings" },
  { id: "fleet", label: "Fleet" },
  { id: "feedback", label: "Feedback" }
];

const RANK_ROLES = [
  { id: "driver", label: "Drivers", countLabel: "Trips taken" },
  { id: "customer", label: "Customers", countLabel: "Shipments" },
  { id: "dispatcher", label: "Dispatchers", countLabel: "Assignments" }
];

function rankPeople(trips, roleKey, nameKey, sortDir) {
  const map = new Map();
  for (const trip of trips) {
    const id = trip[roleKey];
    const name = trip[nameKey];
    if (!id && !name) continue;
    const key = String(id || name);
    const current = map.get(key) || {
      id: key,
      name: name || "Unknown",
      trips: 0,
      delivered: 0,
      cancelled: 0,
      fare: 0
    };
    current.trips += 1;
    if (trip.status === "Delivered") current.delivered += 1;
    if (trip.status === "Cancelled") current.cancelled += 1;
    current.fare += Number(trip.fare || 0);
    if (name) current.name = name;
    map.set(key, current);
  }
  const rows = [...map.values()];
  rows.sort((a, b) => (sortDir === "least" ? a.trips - b.trips : b.trips - a.trips));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

function toLocalDateKey(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const raw = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inDateRange(value, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const rowDate = toLocalDateKey(value);
  if (!rowDate) return false;
  if (dateFrom && rowDate < dateFrom) return false;
  if (dateTo && rowDate > dateTo) return false;
  return true;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(name, columns, rows) {
  const csv = [
    columns.map((column) => csvCell(column.label)).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvCell(column.export ? column.export(row) : row[column.key])).join(",")
    )
  ].join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const [tab, setTab] = useState("rankings");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rankRole, setRankRole] = useState("driver");
  const [rankSort, setRankSort] = useState("most");

  const tripsQuery = useTrips({ limit: 500 });
  const paymentsQuery = usePayments({ limit: 500 });
  const feedbackQuery = useDeliveryFeedbackReport({ limit: 200 });
  const requestsQuery = useCargoRequests({ limit: 500 });
  const earningsQuery = useEarnings({ limit: 500 });
  const trucksQuery = useTrucks({ limit: 500 });

  const trips = useMemo(
    () => (tripsQuery.data?.data || []).filter((row) => inDateRange(row.createdAt, dateFrom, dateTo)),
    [tripsQuery.data, dateFrom, dateTo]
  );
  const payments = useMemo(
    () => (paymentsQuery.data?.data || []).filter((row) => inDateRange(row.createdAt, dateFrom, dateTo)),
    [paymentsQuery.data, dateFrom, dateTo]
  );
  const feedback = useMemo(
    () => (feedbackQuery.data?.data || []).filter((row) => inDateRange(row.createdAt, dateFrom, dateTo)),
    [feedbackQuery.data, dateFrom, dateTo]
  );
  const requests = useMemo(
    () => (requestsQuery.data?.data || []).filter((row) => inDateRange(row.createdAt, dateFrom, dateTo)),
    [requestsQuery.data, dateFrom, dateTo]
  );
  const earnings = useMemo(
    () => (earningsQuery.data?.data || []).filter((row) => inDateRange(row.createdAt, dateFrom, dateTo)),
    [earningsQuery.data, dateFrom, dateTo]
  );
  const fleet = trucksQuery.data?.data || [];

  const rankings = useMemo(() => {
    if (rankRole === "customer") return rankPeople(trips, "customerId", "customer", rankSort);
    if (rankRole === "dispatcher") return rankPeople(trips, "dispatcherId", "dispatcher", rankSort);
    return rankPeople(trips, "driverId", "driver", rankSort);
  }, [trips, rankRole, rankSort]);

  const rankMeta = RANK_ROLES.find((item) => item.id === rankRole) || RANK_ROLES[0];

  const metrics = useMemo(() => {
    const delivered = trips.filter((row) => row.status === "Delivered").length;
    const active = trips.filter((row) => !["Delivered", "Cancelled", "Pending"].includes(row.status)).length;
    const cancelled = trips.filter((row) => row.status === "Cancelled").length;
    const collected = payments.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);
    const balance = payments.reduce((sum, row) => sum + Number(row.balanceDue || 0), 0);
    const paidOut = earnings
      .filter((row) => row.status === "PaidOut")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const avgRating = feedback.length
      ? (
          feedback.reduce((sum, row) => sum + Number(row.rating || 0), 0) / feedback.length
        ).toFixed(1)
      : "—";
    return [
      { label: "Requests", value: requests.length },
      { label: "Trips", value: trips.length },
      { label: "Delivered", value: delivered },
      { label: "Active", value: active },
      { label: "Cancelled", value: cancelled },
      { label: "Collected", value: money(collected) },
      { label: "Balance due", value: money(balance) },
      { label: "Paid out", value: money(paidOut) },
      { label: "Avg rating", value: avgRating }
    ];
  }, [trips, payments, feedback, requests, earnings]);

  const tripChart = useMemo(
    () =>
      ["Pending", "Assigned", "In Transit", "Delivered", "Cancelled"].map((status) => ({
        name: status,
        value: trips.filter((row) => row.status === status).length
      })),
    [trips]
  );

  const revenueChart = useMemo(() => {
    const map = new Map();
    for (const row of payments) {
      const key = toLocalDateKey(row.createdAt).slice(0, 7);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + Number(row.amountPaid || 0));
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, revenue]) => ({ name: month, revenue: Math.round(revenue * 100) / 100 }));
  }, [payments]);

  const rankingColumns = [
    { key: "rank", label: "#" },
    { key: "name", label: rankMeta.label.slice(0, -1) },
    { key: "trips", label: rankMeta.countLabel },
    { key: "delivered", label: "Delivered" },
    { key: "cancelled", label: "Cancelled" },
    { key: "fare", label: "Total fare", render: (row) => money(row.fare), export: (row) => row.fare }
  ];

  const tripColumns = [
    { key: "id", label: "Trip", render: (row) => String(row.id).slice(0, 10), export: (row) => row.id },
    { key: "customer", label: "Customer" },
    { key: "driver", label: "Driver" },
    { key: "dispatcher", label: "Dispatcher" },
    { key: "route", label: "Route" },
    { key: "fare", label: "Fare", render: (row) => money(row.fare), export: (row) => row.fare },
    { key: "status", label: "Status", type: "status" },
    { key: "createdAt", label: "Date", render: (row) => formatDate(row.createdAt), export: (row) => formatDate(row.createdAt) }
  ];

  const paymentColumns = [
    { key: "referenceId", label: "Reference" },
    { key: "customer", label: "Customer" },
    { key: "amount", label: "Amount", render: (row) => money(row.amount), export: (row) => row.amount },
    { key: "amountPaid", label: "Paid", render: (row) => money(row.amountPaid), export: (row) => row.amountPaid },
    { key: "balanceDue", label: "Balance", render: (row) => money(row.balanceDue), export: (row) => row.balanceDue },
    { key: "status", label: "Status", type: "status" },
    { key: "createdAt", label: "Date", render: (row) => formatDate(row.createdAt), export: (row) => formatDate(row.createdAt) }
  ];

  const feedbackColumns = [
    { key: "tripId", label: "Trip" },
    { key: "customer", label: "Customer" },
    { key: "driver", label: "Driver" },
    { key: "rating", label: "Rating", render: (row) => (row.rating ? `${row.rating}/5` : "—") },
    { key: "comment", label: "Comment", render: (row) => row.comment || "—" },
    { key: "createdAt", label: "Date", render: (row) => formatDate(row.createdAt), export: (row) => formatDate(row.createdAt) }
  ];

  const requestColumns = [
    { key: "id", label: "Request" },
    { key: "customer", label: "Customer" },
    { key: "route", label: "Route", render: (row) => `${row.pickup} → ${row.destination}`, export: (row) => `${row.pickup} → ${row.destination}` },
    { key: "truckType", label: "Type" },
    { key: "weight", label: "Weight" },
    { key: "distanceKm", label: "Distance (km)", render: (row) => (row.distanceKm != null ? row.distanceKm : "—") },
    {
      key: "price",
      label: "Price",
      render: (row) => {
        const price = row.finalPrice ?? row.calculatedPrice ?? row.quotedPrice;
        return price != null ? money(price) : "—";
      },
      export: (row) => row.finalPrice ?? row.calculatedPrice ?? row.quotedPrice ?? ""
    },
    { key: "quotedEstimatedTime", label: "ETA", render: (row) => row.quotedEstimatedTime || "—" },
    { key: "status", label: "Status", type: "status" },
    { key: "createdAt", label: "Date", render: (row) => formatDate(row.createdAt), export: (row) => formatDate(row.createdAt) }
  ];

  const earningColumns = [
    { key: "tripId", label: "Trip", render: (row) => row.tripId || "—" },
    { key: "recipient", label: "Recipient", render: (row) => row.recipient || "—" },
    { key: "recipientRole", label: "Role" },
    { key: "amount", label: "Amount", render: (row) => money(row.amount), export: (row) => row.amount },
    { key: "percent", label: "Share %", render: (row) => (row.percent != null ? `${row.percent}%` : "—") },
    { key: "status", label: "Status", type: "status" },
    { key: "payoutMethod", label: "Payout method", render: (row) => row.payoutMethod || "—" },
    { key: "paidOutAt", label: "Paid out", render: (row) => formatDate(row.paidOutAt), export: (row) => formatDate(row.paidOutAt) },
    { key: "createdAt", label: "Date", render: (row) => formatDate(row.createdAt), export: (row) => formatDate(row.createdAt) }
  ];

  const fleetColumns = [
    { key: "truckNumber", label: "Truck" },
    { key: "plateNumber", label: "Plate" },
    { key: "driver", label: "Driver", render: (row) => row.driver || "—" },
    { key: "driverPhone", label: "Driver phone", render: (row) => row.driverPhone || "—" },
    { key: "type", label: "Type", render: (row) => row.truckType || row.type || "—" },
    { key: "capacity", label: "Capacity", render: (row) => row.capacity || "—" },
    { key: "city", label: "City", render: (row) => [row.city, row.region].filter(Boolean).join(", ") || "—" },
    { key: "status", label: "Status", type: "status" }
  ];

  const activeColumns =
    tab === "rankings"
      ? rankingColumns
      : tab === "requests"
        ? requestColumns
        : tab === "trips"
          ? tripColumns
          : tab === "payments"
            ? paymentColumns
            : tab === "earnings"
              ? earningColumns
              : tab === "fleet"
                ? fleetColumns
                : feedbackColumns;
  const activeRows =
    tab === "rankings"
      ? rankings
      : tab === "requests"
        ? requests
        : tab === "trips"
          ? trips
          : tab === "payments"
            ? payments
            : tab === "earnings"
              ? earnings
              : tab === "fleet"
                ? fleet
                : feedback;
  const loading =
    tab === "payments"
      ? paymentsQuery.isLoading
      : tab === "feedback"
        ? feedbackQuery.isLoading
        : tab === "requests"
          ? requestsQuery.isLoading
          : tab === "earnings"
            ? earningsQuery.isLoading
            : tab === "fleet"
              ? trucksQuery.isLoading
              : tripsQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Rank drivers, customers, and dispatchers. Review requests, trips, payments, earnings, fleet, and feedback."
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer size={17} /> Print
            </Button>
            <Button onClick={() => downloadCsv(tab, activeColumns, activeRows)} disabled={!activeRows.length}>
              <Download size={17} /> Export CSV
            </Button>
          </div>
        }
      />

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">From</span>
            <input
              className="stitch-input"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">To</span>
            <input
              className="stitch-input"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
          >
            <RotateCcw size={16} /> Reset
          </Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
            <p className="text-xs font-medium text-on-surface-variant">{item.label}</p>
            <p className="mt-1 text-xl font-bold text-on-surface">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-on-surface">Trips by status</h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tripChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="Trips" fill="#fe6b00" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-on-surface">Revenue collected by month</h2>
          <div className="h-56 w-full">
            {revenueChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip formatter={(value) => money(value)} />
                  <Line type="monotone" dataKey="revenue" name="Collected" stroke="#27ae60" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-on-surface-variant">
                No payments in this period.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="inline-flex rounded-xl border border-outline-variant bg-surface-container-low p-1 print:hidden">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === item.id
                ? "bg-primary-container text-white shadow-sm"
                : "text-on-surface-variant hover:text-primary-container"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "rankings" ? (
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 print:hidden">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Who</span>
              <select className="stitch-input min-w-[10rem]" value={rankRole} onChange={(e) => setRankRole(e.target.value)}>
                {RANK_ROLES.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Sort</span>
              <select className="stitch-input min-w-[10rem]" value={rankSort} onChange={(e) => setRankSort(e.target.value)}>
                <option value="most">Most first</option>
                <option value="least">Least first</option>
              </select>
            </label>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="border-b border-outline-variant px-5 py-4">
          <h2 className="text-lg font-semibold text-on-surface">
            {tab === "rankings"
              ? `${rankMeta.label} · ${rankSort === "most" ? "Most" : "Least"}`
              : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            {activeRows.length} records
            {dateFrom || dateTo ? ` · ${dateFrom || "…"} → ${dateTo || "…"}` : ""}
          </p>
        </div>
        {loading ? (
          <p className="px-5 py-10 text-center text-on-surface-variant">Loading…</p>
        ) : (
          <DataTable columns={activeColumns} rows={activeRows} empty="No records for this period." />
        )}
      </section>
    </div>
  );
}
