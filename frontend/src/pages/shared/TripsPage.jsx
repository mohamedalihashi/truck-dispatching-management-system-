import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Eye, Route, Truck, XCircle } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { MetricCard } from "../../components/ui/MetricCard";
import { useTripSummary, useTrips } from "../../hooks/useApi";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../services/api";
import { money, fareAfterDelivered, TRIP_STATUSES } from "../../utils/helpers";
import { formatTripCargoQuantity } from "../../utils/cargoMeasurement";
import { TripPhotosSection } from "../../components/ui/DocumentCard";

const SHARED_TRIP_STATUSES = ["Open for booking", "Full", "Departed", "Completed", "Cancelled"];

export function TripsPage() {
  const { user } = useAuth();
  const { search } = useDashboardSearch();
  const [statusFilter, setStatusFilter] = useState("");
  const [tripType, setTripType] = useState("ftl");
  const [viewing, setViewing] = useState(null);
  const { data, isLoading } = useTrips({ status: statusFilter || undefined, search: search || undefined });
  const { data: summary } = useTripSummary();
  const sharedTripsQuery = useQuery({
    queryKey: ["admin-shared-trips", statusFilter, search],
    queryFn: () => api.listSharedTrips({
      status: statusFilter || undefined,
      search: search || undefined,
      limit: 50
    }),
    enabled: user.role === "admin" && tripType === "shared"
  });
  const sharedSummaryQuery = useQuery({
    queryKey: ["shared-trips-summary"],
    queryFn: () => api.sharedTripsSummary(),
    enabled: user.role === "admin" && tripType === "shared"
  });
  const canManage = user.role === "admin";
  const showingShared = canManage && tripType === "shared";

  function selectTripType(type) {
    setTripType(type);
    setStatusFilter("");
    setViewing(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Trips"
        subtitle={canManage ? "Monitor FTL and shared trips separately." : "Monitor your active and past trips."}
      />

      {canManage && (
        <div className="inline-flex rounded-xl border border-outline-variant bg-surface-container-lowest p-1">
          <button
            type="button"
            onClick={() => selectTripType("ftl")}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
              !showingShared ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            FTL Trips
          </button>
          <button
            type="button"
            onClick={() => selectTripType("shared")}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
              showingShared ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Shared Trips
          </button>
        </div>
      )}

      {showingShared ? (
        <AdminSharedTripsView
          data={sharedTripsQuery.data}
          summary={sharedSummaryQuery.data}
          isLoading={sharedTripsQuery.isLoading}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          viewing={viewing}
          setViewing={setViewing}
        />
      ) : (
      <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard icon={Route} label="Total Trips" value={summary?.total ?? "—"} tone="navy" />
        <MetricCard icon={Truck} label="Total Active" value={summary?.active ?? "—"} tone="blue" />
        <MetricCard icon={Clock} label="Total Pending" value={summary?.pending ?? "—"} tone="amber" />
        <MetricCard icon={XCircle} label="Total Cancelled" value={summary?.cancelled ?? "—"} tone="orange" />
        <MetricCard icon={CheckCircle2} label="Total Received" value={summary?.delivered ?? "—"} tone="green" />
      </section>

      <div className="flex flex-wrap gap-3">
        <select className="stitch-input max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {TRIP_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">All Trips</h2>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading trips…</p>
        ) : (
          <DataTable
            rows={data?.data || []}
            columns={[
              { key: "id", label: "Trip" },
              {
                key: "route",
                label: "Route",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              { key: "customer", label: "Customer" },
              { key: "driver", label: "Driver" },
              { key: "truck", label: "Truck" },
              {
                key: "fare",
                label: "Fare",
                render: (row) => fareAfterDelivered(row.status, row.fare)
              },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge status={row.status} />
              },
              {
                key: "actions",
                label: "Actions",
                render: (row) => (
                  <div className="flex flex-wrap items-center gap-1">
                    <button type="button" className="p-1 text-on-surface-variant" onClick={() => setViewing(row)}>
                      <Eye size={16} />
                    </button>
                  </div>
                )
              }
            ]}
          />
        )}
      </section>

      {viewing && (
        <Modal title={`Trip ${viewing.id}`} onClose={() => setViewing(null)} wide>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <Detail label="Status" value={<StatusBadge status={viewing.status} />} />
            <Detail label="Fare" value={fareAfterDelivered(viewing.status, viewing.fare)} />
            <Detail label="Customer" value={viewing.customer} />
            <Detail label="Driver" value={viewing.driver || "—"} />
            <Detail label="Truck" value={viewing.truck || "—"} />
            <Detail label="Cargo request" value={viewing.cargoRequestId || "—"} />
            <Detail label="Cargo type / Nooca alaabta" value={viewing.cargoType || viewing.cargo || "—"} />
            <Detail
              label="Quantity / Tirada"
              value={formatTripCargoQuantity(viewing)}
            />
            <Detail label="Pickup" value={viewing.pickup} />
            <Detail label="Destination" value={viewing.destination} />
            <Detail label="Distance" value={viewing.distance || "—"} />
            <Detail label="ETA" value={viewing.estimatedTime || viewing.eta || "—"} />
          </dl>
          <TripPhotosSection
            cargoImageUrl={viewing.cargoImageUrl}
            deliveryProofUrl={viewing.deliveryProofUrl}
          />
        </Modal>
      )}
      </>
      )}
    </div>
  );
}

function AdminSharedTripsView({
  data,
  summary,
  isLoading,
  statusFilter,
  setStatusFilter,
  viewing,
  setViewing
}) {
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard icon={Route} label="Total Shared" value={summary?.total ?? "—"} tone="navy" />
        <MetricCard icon={Truck} label="Open" value={summary?.open ?? "—"} tone="blue" />
        <MetricCard icon={CheckCircle2} label="Full" value={summary?.full ?? "—"} tone="green" />
        <MetricCard icon={Route} label="Departed" value={summary?.departed ?? "—"} tone="orange" />
      </section>

      <div className="flex flex-wrap gap-3">
        <select className="stitch-input max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {SHARED_TRIP_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Shared Trips</h2>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading shared trips…</p>
        ) : (
          <DataTable
            rows={data?.data || []}
            columns={[
              { key: "id", label: "Trip" },
              {
                key: "route",
                label: "Route",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              { key: "driver", label: "Driver" },
              { key: "truck", label: "Truck" },
              {
                key: "capacity",
                label: "Available",
                render: (row) => `${row.availableTons}t / ${row.totalCapacityTons}t`
              },
              { key: "bookingsCount", label: "Bookings" },
              {
                key: "pricePerTon",
                label: "Price / Ton",
                render: (row) => money(row.pricePerTon)
              },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge status={row.status} />
              },
              {
                key: "actions",
                label: "Actions",
                render: (row) => (
                  <button type="button" className="p-1 text-on-surface-variant" onClick={() => setViewing(row)}>
                    <Eye size={16} />
                  </button>
                )
              }
            ]}
          />
        )}
      </section>

      {viewing && (
        <Modal title={`Shared Trip ${viewing.id}`} onClose={() => setViewing(null)} wide>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Status" value={<StatusBadge status={viewing.status} />} />
            <Detail label="Driver" value={viewing.driver || "—"} />
            <Detail label="Truck" value={viewing.truck || "—"} />
            <Detail label="Pickup" value={viewing.pickup} />
            <Detail label="Destination" value={viewing.destination} />
            <Detail label="Total capacity" value={`${viewing.totalCapacityTons} tons`} />
            <Detail label="Available capacity" value={`${viewing.availableTons} tons`} />
            <Detail label="Bookings" value={viewing.bookingsCount ?? 0} />
            <Detail label="Price per ton" value={money(viewing.pricePerTon)} />
            <Detail
              label="Departure"
              value={viewing.departureDate ? new Date(viewing.departureDate).toLocaleString() : "Flexible"}
            />
          </dl>
        </Modal>
      )}
    </>
  );
}

function Detail({ label, value, className = "" }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-semibold text-on-surface">{value}</dd>
    </div>
  );
}
