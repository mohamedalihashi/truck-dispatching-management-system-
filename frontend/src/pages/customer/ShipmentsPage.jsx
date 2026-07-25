import { useState } from "react";
import { useForm } from "react-hook-form";
import { Eye, Pencil, Plus, RotateCcw, Star, Trash2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { TripFeedbackForm } from "../../components/TripFeedbackForm";
import { resolveUploadUrl } from "../../config/api.js";
import { useCancelCargo, useCargoRequests, useRestoreCargo, useTrips, useUpdateCargo } from "../../hooks/useApi";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";
import { api } from "../../services/api";
import { useQueryClient } from "@tanstack/react-query";
import { CANCELABLE_REQUEST_STATUSES, REQUEST_STATUSES } from "../../utils/helpers";
import { QuoteReviewPanel } from "../../components/QuoteReviewPanel";

export function ShipmentsPage() {
  const location = useLocation();
  const { search } = useDashboardSearch();
  const [statusFilter, setStatusFilter] = useState("");
  const [viewingRequest, setViewingRequest] = useState(null);
  const [viewingTrip, setViewingTrip] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const { data: trips, isLoading: tripsLoading } = useTrips({ search: search || undefined });
  const { data: requests, isLoading: requestsLoading } = useCargoRequests({
    status: statusFilter || undefined,
    search: search || undefined
  });
  const updateCargo = useUpdateCargo();
  const cancelCargo = useCancelCargo();
  const restoreCargo = useRestoreCargo();
  const qc = useQueryClient();

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  function openEdit(row) {
    setEditing(row);
    setError("");
    reset({
      pickup: row.pickup,
      destination: row.destination,
      truckType: row.truckType,
      weight: row.weight,
      description: row.description,
      sender: row.sender || "",
      receiver: row.receiver || "",
      specialInstructions: row.specialInstructions || ""
    });
  }

  async function onUpdate(values) {
    setError("");
    try {
      await updateCargo.mutateAsync({ id: editing.id, payload: values });
      setEditing(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelRequest(id) {
    if (!confirm("Cancel this cargo request?")) return;
    try {
      await cancelCargo.mutateAsync(id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function restoreRequest(id) {
    if (!confirm("Restore this cancelled request?")) return;
    try {
      await restoreCargo.mutateAsync(id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function confirmDelivery(row) {
    if (!confirm("Confirm that this shipment was delivered?")) return;
    try {
      const updated = await api.confirmTripDelivery(row.id);
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setViewingTrip({ ...row, ...updated, feedback: updated.feedback || null });
    } catch (err) {
      alert(err.message);
    }
  }

  function handleFeedbackSubmitted(updatedTrip) {
    setViewingTrip(updatedTrip);
    qc.invalidateQueries({ queryKey: ["trips"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
    qc.invalidateQueries({ queryKey: ["trip-feedback"] });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Shipments"
        subtitle="Create, view, edit, and cancel your cargo requests and trips."
        actions={
          <Link to="/customer/book">
            <Button>
              <Plus size={16} /> Book truck
            </Button>
          </Link>
        }
      />

      {location.state?.created && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          Cargo request {location.state.created} created successfully.
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Cargo requests</h2>
          <select
            className="stitch-input max-w-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {requestsLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading requests…</p>
        ) : (
          <DataTable
            rows={requests?.data || []}
            empty="No cargo requests yet. Book a truck to get started."
            columns={[
              { key: "id", label: "Request" },
              {
                key: "route",
                label: "Route",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              { key: "truckType", label: "Type" },
              { key: "weight", label: "Weight" },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge status={row.status} />
              },
              {
                key: "actions",
                label: "Actions",
                render: (row) => (
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className="p-1 text-on-surface-variant" onClick={() => setViewingRequest(row)} title="View">
                      <Eye size={16} />
                    </button>
                    {row.status === "Pending" && (
                      <button type="button" className="p-1 text-secondary-container" onClick={() => openEdit(row)} title="Edit">
                        <Pencil size={16} />
                      </button>
                    )}
                    {CANCELABLE_REQUEST_STATUSES.includes(row.status) && (
                      <button type="button" className="p-1 text-error" onClick={() => cancelRequest(row.id)} title="Cancel">
                        <Trash2 size={16} />
                      </button>
                    )}
                    {row.status === "Cancelled" && (
                      <button
                        type="button"
                        className="p-1 text-secondary-container disabled:opacity-50"
                        onClick={() => restoreRequest(row.id)}
                        disabled={restoreCargo.isPending}
                        title="Restore"
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                  </div>
                )
              }
            ]}
          />
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Trips</h2>
        </div>
        {tripsLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading trips…</p>
        ) : (
          <DataTable
            rows={trips?.data || []}
            empty="No trips yet."
            columns={[
              { key: "id", label: "Trip" },
              {
                key: "route",
                label: "Route",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge status={row.status} />
              },
              { key: "driver", label: "Driver" },
              { key: "truck", label: "Truck" },
              {
                key: "actions",
                label: "Actions",
                render: (row) => (
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className="p-1 text-on-surface-variant" onClick={() => setViewingTrip(row)} title="View">
                      <Eye size={16} />
                    </button>
                    {["In Transit", "Loaded"].includes(row.status) && (
                      <>
                        <Link to="/customer/tracking" className="text-xs font-semibold text-secondary-container hover:underline">
                          Track
                        </Link>
                      </>
                    )}
                    {row.status === "Delivered" && row.deliveryProofUrl && !row.deliveryConfirmedAt && (
                      <Button className="px-2 py-1 text-xs" onClick={() => confirmDelivery(row)}>
                        Confirm delivery
                      </Button>
                    )}
                    {row.status === "Delivered" && !row.feedback && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-amber-600 hover:underline"
                        onClick={() => setViewingTrip(row)}
                        title="Rate delivery"
                      >
                        <Star size={14} className="fill-amber-400 text-amber-400" />
                        Rate goods
                      </button>
                    )}
                  </div>
                )
              }
            ]}
          />
        )}
      </section>

      {viewingRequest && (
        <Modal title={`Request ${viewingRequest.id}`} onClose={() => setViewingRequest(null)} wide>
          <QuoteReviewPanel request={viewingRequest} />

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <Detail label="Route" value={`${viewingRequest.pickup} → ${viewingRequest.destination}`} className="sm:col-span-2" />
            <Detail label="Status" value={<StatusBadge status={viewingRequest.status} />} />
            <Detail
              label="Preferred pickup"
              value={
                viewingRequest.preferredPickupDate
                  ? new Date(viewingRequest.preferredPickupDate).toLocaleDateString()
                  : "—"
              }
            />
            <Detail label="Truck type" value={viewingRequest.truckType} />
            <Detail label="Weight" value={viewingRequest.weight} />
            {(viewingRequest.finalPrice != null || viewingRequest.calculatedPrice != null || viewingRequest.quotedPrice != null) ? (
              <Detail
                label="Price"
                value={`$${Number(viewingRequest.finalPrice ?? viewingRequest.calculatedPrice ?? viewingRequest.quotedPrice).toLocaleString()}`}
              />
            ) : null}
            {viewingRequest.quotedEstimatedTime ? (
              <Detail label="ETA" value={viewingRequest.quotedEstimatedTime} />
            ) : null}
            {viewingRequest.distanceKm != null ? (
              <Detail label="Distance" value={`${viewingRequest.distanceKm} km`} />
            ) : null}
            <Detail label="Driver" value={viewingRequest.driver || "—"} />
            <Detail label="Truck" value={viewingRequest.truck || "—"} />
            <Detail label="Description" value={viewingRequest.description} className="sm:col-span-2" />
            <Detail label="Booking customer role" value={viewingRequest.customerRole ? `You are the ${viewingRequest.customerRole.toLowerCase()}` : "—"} />
            <Detail label="Sender" value={viewingRequest.senderName || viewingRequest.sender || "—"} />
            <Detail label="Sender phone" value={viewingRequest.senderPhone || "—"} />
            <Detail label="Receiver" value={viewingRequest.receiverName || viewingRequest.receiver || "—"} />
            <Detail label="Receiver phone" value={viewingRequest.receiverPhone || "—"} />
            <Detail label="Instructions" value={viewingRequest.specialInstructions || "—"} className="sm:col-span-2" />
          </dl>
          <div className="mt-4 flex justify-end gap-2">
            {viewingRequest.status === "Pending" && (
              <Button onClick={() => { setViewingRequest(null); openEdit(viewingRequest); }}>Edit</Button>
            )}
            <Button variant="secondary" onClick={() => setViewingRequest(null)}>Close</Button>
          </div>
        </Modal>
      )}

      {viewingTrip && (
        <Modal title={`Trip ${viewingTrip.id}`} onClose={() => setViewingTrip(null)} wide>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <Detail label="Route" value={`${viewingTrip.pickup} → ${viewingTrip.destination}`} className="sm:col-span-2" />
            <Detail label="Status" value={<StatusBadge status={viewingTrip.status} />} />
            <Detail label="Driver" value={viewingTrip.driver || "—"} />
            <Detail label="Truck" value={viewingTrip.truck || "—"} />
            <Detail label="Distance" value={viewingTrip.distance || "—"} />
            <Detail label="ETA" value={viewingTrip.estimatedTime || "—"} />
            <Detail label="Fare" value={viewingTrip.fare != null ? `$${Number(viewingTrip.fare).toLocaleString()}` : "—"} />
            <Detail label="Booking customer role" value={viewingTrip.customerRole ? `You are the ${viewingTrip.customerRole.toLowerCase()}` : "—"} />
            <Detail label="Sender" value={viewingTrip.senderName || "—"} />
            <Detail label="Sender phone" value={viewingTrip.senderPhone || "—"} />
            <Detail label="Receiver" value={viewingTrip.receiverName || "—"} />
            <Detail label="Receiver phone" value={viewingTrip.receiverPhone || "—"} />
            <Detail
              label="Last location"
              value={
                viewingTrip.lastLocation
                  ? `${Number(viewingTrip.lastLocation.lat).toFixed(4)}, ${Number(viewingTrip.lastLocation.lng).toFixed(4)}`
                  : "—"
              }
              className="sm:col-span-2"
            />
            {viewingTrip.deliveryProofUrl && !viewingTrip.deliveryProofUrl.startsWith("mock://") ? (
              <Detail
                label="Proof of delivery"
                value={
                  <a
                    href={resolveUploadUrl(viewingTrip.deliveryProofUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-secondary-container hover:underline"
                  >
                    View delivery photo
                  </a>
                }
                className="sm:col-span-2"
              />
            ) : null}
          </dl>

          {viewingTrip.status === "Delivered" && (
            <div className="mt-6">
              <TripFeedbackForm trip={viewingTrip} onSubmitted={handleFeedbackSubmitted} />
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            {["In Transit", "Loaded", "Accepted", "Assigned"].includes(viewingTrip.status) && (
              <Link to="/customer/tracking">
                <Button>Live tracking</Button>
              </Link>
            )}
            <Button variant="secondary" onClick={() => setViewingTrip(null)}>Close</Button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.id}`} onClose={() => setEditing(null)} wide>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit(onUpdate)}>
            <input className="stitch-input" placeholder="Pickup" {...register("pickup", { required: true })} />
            <input className="stitch-input" placeholder="Destination" {...register("destination", { required: true })} />
            <input className="stitch-input" placeholder="Write required truck type" {...register("truckType", { required: true })} />
            <input className="stitch-input" placeholder="Weight" {...register("weight", { required: true })} />
            <input className="stitch-input" placeholder="Sender" {...register("sender")} />
            <input className="stitch-input" placeholder="Receiver" {...register("receiver")} />
            <textarea className="stitch-input min-h-20 sm:col-span-2" placeholder="Description" {...register("description", { required: true })} />
            <textarea className="stitch-input min-h-16 sm:col-span-2" placeholder="Special instructions" {...register("specialInstructions")} />
            {error && <p className="sm:col-span-2 text-sm text-error">{error}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button disabled={isSubmitting || updateCargo.isPending}>Save changes</Button>
            </div>
          </form>
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
