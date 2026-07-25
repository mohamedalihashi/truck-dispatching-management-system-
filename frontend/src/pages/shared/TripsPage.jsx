import { useState } from "react";
import { CheckCircle2, Clock, Eye, Route, RotateCcw, Truck, XCircle } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { MetricCard } from "../../components/ui/MetricCard";
import { useTripActions, useTripSummary, useTrips } from "../../hooks/useApi";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";
import { useAuth } from "../../contexts/AuthContext";
import { money, nextTripStatus, TRIP_STATUSES } from "../../utils/helpers";

export function TripsPage() {
  const { user } = useAuth();
  const { search } = useDashboardSearch();
  const [statusFilter, setStatusFilter] = useState("");
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState("");
  const { data, isLoading } = useTrips({ status: statusFilter || undefined, search: search || undefined });
  const { data: summary } = useTripSummary();
  const actions = useTripActions();
  const canManage = user.role === "dispatcher" || user.role === "admin";

  async function updateTripStatus(id, nextStatus) {
    setError("");
    try {
      await actions.updateStatus.mutateAsync({ id, status: nextStatus });
    } catch (err) {
      setError(err.message);
    }
  }

  async function restoreTrip(id) {
    setError("");
    if (!confirm(`Restore trip ${id}?`)) return;
    try {
      await actions.restore.mutateAsync(id);
      setViewing((current) => (current?.id === id ? null : current));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Trips"
        subtitle={canManage ? "Monitor trips and update status across the marketplace." : "Monitor active and historical marketplace trips."}
      />

      {error && (
        <p className="rounded-xl border border-error-container bg-error-container/30 px-4 py-3 text-sm text-on-error-container">
          {error}
        </p>
      )}

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
                render: (row) => money(row.fare)
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
                    {canManage && !["Delivered", "Cancelled"].includes(row.status) && (
                      <>
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => updateTripStatus(row.id, nextTripStatus(row.status))}
                          disabled={actions.updateStatus.isPending}
                        >
                          Advance
                        </Button>
                        {row.status !== "Delayed" && (
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            onClick={() => updateTripStatus(row.id, "Delayed")}
                            disabled={actions.updateStatus.isPending}
                          >
                            Delayed
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          className="px-2 py-1 text-xs"
                          onClick={() => {
                            if (confirm(`Cancel trip ${row.id}?`)) updateTripStatus(row.id, "Cancelled");
                          }}
                          disabled={actions.updateStatus.isPending}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {canManage && row.status === "Cancelled" && (
                      <Button
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        onClick={() => restoreTrip(row.id)}
                        disabled={actions.restore.isPending}
                      >
                        <RotateCcw size={14} /> Restore
                      </Button>
                    )}
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
            <Detail label="Fare" value={money(viewing.fare)} />
            <Detail label="Customer" value={viewing.customer} />
            <Detail label="Driver" value={viewing.driver || "—"} />
            <Detail label="Truck" value={viewing.truck || "—"} />
            <Detail label="Cargo request" value={viewing.cargoRequestId || "—"} />
            <Detail label="Pickup" value={viewing.pickup} />
            <Detail label="Destination" value={viewing.destination} />
            <Detail label="Booking customer role" value={viewing.customerRole ? `Customer is the ${viewing.customerRole.toLowerCase()}` : "—"} />
            <Detail label="Sender" value={viewing.senderName || "—"} />
            <Detail label="Sender phone" value={viewing.senderPhone || "—"} />
            <Detail label="Receiver" value={viewing.receiverName || "—"} />
            <Detail label="Receiver phone" value={viewing.receiverPhone || "—"} />
            <Detail label="Distance" value={viewing.distance || "—"} />
            <Detail label="ETA" value={viewing.estimatedTime || viewing.eta || "—"} />
            <Detail
              label="Last location"
              value={
                viewing.lastLocation
                  ? `${Number(viewing.lastLocation.lat).toFixed(4)}, ${Number(viewing.lastLocation.lng).toFixed(4)}`
                  : "—"
              }
              className="sm:col-span-2"
            />
          </dl>
          {canManage && !["Delivered", "Cancelled"].includes(viewing.status) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-outline-variant pt-4">
              <span className="w-full text-xs font-medium uppercase tracking-wider text-on-surface-variant">Set status</span>
              {TRIP_STATUSES.filter((s) => s !== viewing.status).map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  onClick={() => {
                    updateTripStatus(viewing.id, s);
                    setViewing((v) => (v ? { ...v, status: s } : v));
                  }}
                >
                  {s}
                </Button>
              ))}
            </div>
          )}
          {canManage && viewing.status === "Cancelled" && (
            <div className="mt-4 border-t border-outline-variant pt-4">
              <Button variant="secondary" onClick={() => restoreTrip(viewing.id)} disabled={actions.restore.isPending}>
                <RotateCcw size={14} /> Restore trip
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
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
