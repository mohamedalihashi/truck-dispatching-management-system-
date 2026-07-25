import { useMemo, useRef, useState } from "react";
import { Eye, MapPin, Upload } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { useTripActions, useTrips } from "../../hooks/useApi";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";
import { driverTripActionLabel, nextDriverTripStatus, TRIP_STATUSES } from "../../utils/helpers";
import { api } from "../../services/api";
import { useQueryClient } from "@tanstack/react-query";

const ACTIVE_STATUSES = ["Assigned", "Accepted", "Arrived Pickup", "Loaded", "In Transit", "Delayed"];

export function DriverJobsPage() {
  const { search } = useDashboardSearch();
  const { data, isLoading } = useTrips({ search: search || undefined });
  const actions = useTripActions();
  const fileRef = useRef(null);
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("");
  const [viewing, setViewing] = useState(null);
  const [podTripId, setPodTripId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const rows = useMemo(() => {
    const all = data?.data || [];
    if (!statusFilter) return all;
    return all.filter((trip) => trip.status === statusFilter);
  }, [data?.data, statusFilter]);

  async function runAction(label, fn) {
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(label);
    } catch (err) {
      setError(err.message);
    }
  }

  async function rejectTrip(id) {
    if (!confirm("Reject this job? It will be returned to dispatch.")) return;
    await runAction(`Job ${id} rejected`, () => actions.reject.mutateAsync(id));
  }

  async function advanceStatus(id, status) {
    await runAction(`Status updated to ${status}`, () => actions.updateStatus.mutateAsync({ id, status }));
  }

  async function shareGps(id) {
    if (!navigator.geolocation) {
      setError("GPS is not available on this device.");
      return;
    }

    await runAction(`Location shared for ${id}`, () =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await actions.shareLocation.mutateAsync({
                id,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
              });
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          (err) => reject(new Error(err.message || "Could not read GPS location. Allow location access and try again.")),
          { enableHighAccuracy: true, timeout: 20_000 }
        );
      })
    );
  }

  async function uploadProof(event) {
    const file = event.target.files?.[0];
    if (!file || !podTripId) return;
    const formData = new FormData();
    formData.append("proof", file);
    await runAction(`Proof uploaded for ${podTripId}`, async () => {
      await api.uploadProof(podTripId, formData);
      qc.invalidateQueries({ queryKey: ["trips"] });
    });
    event.target.value = "";
    setPodTripId(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="My Jobs"
        subtitle="Accept starts only after the customer pays the 30% deposit. GPS streams on active jobs."
      />

      {message && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Assigned Deliveries</h2>
          <select
            className="stitch-input max-w-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {TRIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading jobs…</p>
        ) : (
          <DataTable
            rows={rows}
            empty="No jobs assigned yet. When dispatch assigns your truck, jobs appear here."
            columns={[
              { key: "id", label: "Trip" },
              {
                key: "route",
                label: "Route",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              { key: "truck", label: "Truck" },
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
                    <button
                      type="button"
                      className="p-1 text-on-surface-variant hover:text-secondary-container"
                      title="View details"
                      onClick={() => setViewing(row)}
                    >
                      <Eye size={16} />
                    </button>

                    {row.status === "Assigned" && (
                      <>
                        <Button
                          className="px-2 py-1 text-xs"
                          disabled={actions.accept.isPending}
                          onClick={() => runAction(`Job ${row.id} accepted`, () => actions.accept.mutateAsync(row.id))}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="danger"
                          className="px-2 py-1 text-xs"
                          disabled={actions.reject.isPending}
                          onClick={() => rejectTrip(row.id)}
                        >
                          Reject
                        </Button>
                      </>
                    )}

                    {ACTIVE_STATUSES.includes(row.status) &&
                      row.status !== "Assigned" &&
                      driverTripActionLabel(row.status) && (
                      <>
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          disabled={actions.updateStatus.isPending}
                          onClick={() =>
                            advanceStatus(row.id, nextDriverTripStatus(row.status))
                          }
                        >
                          {driverTripActionLabel(row.status)}
                        </Button>
                        {["In Transit", "Loaded"].includes(row.status) && (
                          <Button
                            variant="ghost"
                            className="px-2 py-1 text-xs"
                            disabled={actions.updateStatus.isPending}
                            onClick={() => advanceStatus(row.id, "Delayed")}
                          >
                            Delayed
                          </Button>
                        )}
                      </>
                    )}

                    {!["Cancelled", "Delivered"].includes(row.status) && (
                      <button
                        type="button"
                        className="p-1 text-on-surface-variant hover:text-secondary-container"
                        title="Share GPS"
                        onClick={() => shareGps(row.id)}
                      >
                        <MapPin size={16} />
                      </button>
                    )}

                    {row.status === "In Transit" && !row.deliveryProofUrl && (
                      <button
                        type="button"
                        className="p-1 text-on-surface-variant hover:text-secondary-container"
                        title="Upload POD"
                        onClick={() => {
                          setPodTripId(row.id);
                          fileRef.current?.click();
                        }}
                      >
                        <Upload size={16} />
                      </button>
                    )}
                  </div>
                )
              }
            ]}
          />
        )}
      </section>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadProof} />

      {viewing && (
        <Modal title={`Trip ${viewing.id}`} onClose={() => setViewing(null)} wide>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Route" value={`${viewing.pickup} → ${viewing.destination}`} className="sm:col-span-2" />
            <Detail label="Status" value={<StatusBadge status={viewing.status} />} />
            <Detail label="Truck" value={viewing.truck || "—"} />
            <Detail label="Customer" value={viewing.customerName || viewing.customer || "—"} />
            <Detail label="Distance" value={viewing.distance || "—"} />
            <Detail label="ETA" value={viewing.estimatedTime || viewing.eta || "—"} />
            <Detail
              label="Fare"
              value={viewing.fare != null ? `$${Number(viewing.fare).toLocaleString()}` : "—"}
            />
            <Detail label="Cargo" value={viewing.cargo || viewing.description || "—"} className="sm:col-span-2" />
            <Detail label="Booking customer role" value={viewing.customerRole ? `Customer is the ${viewing.customerRole.toLowerCase()}` : "—"} />
            <Detail label="Sender" value={viewing.senderName || "—"} />
            <Detail label="Sender phone" value={viewing.senderPhone || "—"} />
            <Detail label="Receiver" value={viewing.receiverName || "—"} />
            <Detail label="Receiver phone" value={viewing.receiverPhone || "—"} />
            <Detail
              label="Last location"
              value={
                viewing.lastLocation
                  ? `${Number(viewing.lastLocation.lat).toFixed(4)}, ${Number(viewing.lastLocation.lng).toFixed(4)}`
                  : "—"
              }
              className="sm:col-span-2"
            />
            <Detail
              label="Delivery proof"
              value={viewing.deliveryProofUrl ? "Uploaded" : "Not uploaded"}
            />
          </dl>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {viewing.status === "Assigned" && (
              <>
                <Button onClick={() => { setViewing(null); runAction(`Job ${viewing.id} accepted`, () => actions.accept.mutateAsync(viewing.id)); }}>
                  Accept
                </Button>
                <Button variant="danger" onClick={() => { const id = viewing.id; setViewing(null); rejectTrip(id); }}>
                  Reject
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={() => setViewing(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Detail({ label, value, className = "" }) {
  return (
    <div className={className}>
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 font-semibold text-primary-container">{value}</dd>
    </div>
  );
}
