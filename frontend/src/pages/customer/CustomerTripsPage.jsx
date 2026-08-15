import { useState } from "react";
import { useForm } from "react-hook-form";
import { Eye, MapPin, Pencil, Plus, RotateCcw, Share2, Star, Trash2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { TripFeedbackForm } from "../../components/TripFeedbackForm";
import { useCancelCargo, useCargoRequests, useRestoreCargo, useTrips, useUpdateCargo } from "../../hooks/useApi";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";
import { api } from "../../services/api";
import { useQueryClient } from "@tanstack/react-query";
import { CANCELABLE_REQUEST_STATUSES, REQUEST_STATUSES, LIVE_MAP_STATUSES, fareAfterDelivered } from "../../utils/helpers";
import { formatTripCargoQuantity } from "../../utils/cargoMeasurement";
import { QuoteReviewPanel } from "../../components/QuoteReviewPanel";
import { TripPaymentJourney } from "../../components/TripPaymentJourney";
import {
  CargoBookingFields,
  bookingDefaultsFromRequest,
  buildCargoBookingPayload
} from "../../components/CargoBookingFields";
import { applyFormValidationIssues } from "../../utils/bookingValidation";
import { deliveryConfirmCode } from "../../data/tripCustomerMessages";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { TripPhotosSection } from "../../components/ui/DocumentCard";

export function CustomerTripsPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const { search } = useDashboardSearch();
  const [statusFilter, setStatusFilter] = useState("");
  const [viewingRequest, setViewingRequest] = useState(null);
  const [viewingTrip, setViewingTrip] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const [shareBusyId, setShareBusyId] = useState(null);

  const { data: trips, isLoading: tripsLoading } = useTrips({ search: search || undefined });
  const { data: requests, isLoading: requestsLoading } = useCargoRequests({
    status: statusFilter || undefined,
    search: search || undefined
  });
  const updateCargo = useUpdateCargo();
  const cancelCargo = useCancelCargo();
  const restoreCargo = useRestoreCargo();
  const qc = useQueryClient();

  const myTrips = (trips?.data || []).filter(
    (trip) => !user?.id || trip.customerId === user.id
  );
  const myRequests = (requests?.data || []).filter(
    (row) => !user?.id || row.customerId === user.id
  );

  const { register, handleSubmit, reset, watch, setValue, setError: setFormError, formState: { errors, isSubmitting } } = useForm();

  function openEdit(row) {
    setEditing(row);
    setError("");
    reset(bookingDefaultsFromRequest(row));
  }

  async function onUpdate(values) {
    setError("");
    try {
      const payload = buildCargoBookingPayload({
        ...values,
        loadType: editing.loadType === "SHARED" ? "SHARED" : "FTL"
      });
      delete payload.customerId;
      payload.loadType = editing.loadType || payload.loadType;
      await updateCargo.mutateAsync({ id: editing.id, payload });
      setEditing(null);
    } catch (err) {
      if (err.issues) applyFormValidationIssues(setFormError, err.issues);
      setError(err.details?.issues?.[0]?.message || err.message);
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
    if (!confirm("Confirm that this trip was delivered?")) return;
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
    qc.invalidateQueries({ queryKey: ["trip-feedback"] });
  }

  async function shareTripLink(row) {
    setShareBusyId(row.id);
    try {
      const link = await api.createTripTrackingLink(row.id);
      const url =
        link.url ||
        `${window.location.origin}${link.path || `/track/${link.token}`}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert("Tracking link copied. Anyone with the link can follow this trip live.");
      } else {
        prompt("Copy tracking link", url);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setShareBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("customer.tripsTitle")}
        subtitle={t("customer.tripsPageSubtitle")}
        actions={
          <Link to="/customer/find-trucks">
            <Button>
              <Plus size={16} /> {t("customer.ftlBookTitle")}
            </Button>
          </Link>
        }
      />

      <TripPaymentJourney />

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
            rows={myRequests}
            empty="No cargo requests yet. Book a truck to get started."
            columns={[
              { key: "id", label: "Request" },
              {
                key: "route",
                label: "Route",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              {
                key: "loadType",
                label: "Load",
                render: (row) => row.loadType || "FTL"
              },
              {
                key: "cargoType",
                label: "Cargo type",
                render: (row) => row.cargoType || row.description || "—"
              },
              {
                key: "weight",
                label: "Weight",
                render: (row) => {
                  const w = row.weight;
                  if (!w || /^(tbd|pending|n\/a)$/i.test(String(w).trim())) return "Pending pickup";
                  return w;
                }
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
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className="p-1 text-on-surface-variant" onClick={() => setViewingRequest(row)} title="View">
                      <Eye size={16} />
                    </button>
                    {row.status === "Pending" && row.loadType !== "SHARED" && (
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
            rows={myTrips}
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
                    {LIVE_MAP_STATUSES.includes(row.status) && (
                      <Link
                        to={`/customer/tracking?trip=${encodeURIComponent(row.id)}`}
                        className="p-1 text-secondary-container"
                        title="Live track"
                      >
                        <MapPin size={16} />
                      </Link>
                    )}
                    {!["Cancelled"].includes(row.status) && (
                      <button
                        type="button"
                        className="p-1 text-on-surface-variant disabled:opacity-50"
                        onClick={() => shareTripLink(row)}
                        disabled={shareBusyId === row.id}
                        title="Share tracking link"
                      >
                        <Share2 size={16} />
                      </button>
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
          <QuoteReviewPanel request={viewingRequest} onUpdated={(updated) => setViewingRequest(updated)} />

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
            <Detail label="Cargo type" value={viewingRequest.cargoType || viewingRequest.description || "—"} />
            <Detail
              label="Weight"
              value={
                !viewingRequest.weight || /^(tbd|pending|n\/a)$/i.test(String(viewingRequest.weight).trim())
                  ? "Pending — driver enters at pickup"
                  : viewingRequest.weight
              }
            />
            <Detail
              label="Price"
              value={fareAfterDelivered(
                viewingRequest.status,
                viewingRequest.finalPrice ?? viewingRequest.quotedPrice
              )}
            />
            {viewingRequest.quotedEstimatedTime ? (
              <Detail label="ETA" value={viewingRequest.quotedEstimatedTime} />
            ) : null}
            {viewingRequest.distanceKm != null && String(viewingRequest.status || "").toLowerCase().includes("delivered") ? (
              <Detail label="Distance" value={`${viewingRequest.distanceKm} km`} />
            ) : null}
            <Detail label="Driver" value={viewingRequest.driver || "—"} />
            <Detail label="Truck" value={viewingRequest.truck || "—"} />
            <Detail label="Description" value={viewingRequest.description} className="sm:col-span-2" />
            <Detail label="Instructions" value={viewingRequest.specialInstructions || "—"} className="sm:col-span-2" />
          </dl>
          <TripPhotosSection cargoImageUrl={viewingRequest.cargoImageUrl} />
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
            <Detail label="Cargo type / Nooca alaabta" value={viewingTrip.cargoType || viewingTrip.cargo || "—"} />
            <Detail label="Quantity / Tirada" value={formatTripCargoQuantity(viewingTrip)} />
            <Detail label="Distance" value={viewingTrip.distance || "—"} />
            <Detail label="ETA" value={viewingTrip.estimatedTime || "—"} />
            <Detail label="Fare" value={fareAfterDelivered(viewingTrip.status, viewingTrip.fare)} />
          </dl>
          <TripPhotosSection
            cargoImageUrl={viewingTrip.cargoImageUrl}
            deliveryProofUrl={viewingTrip.deliveryProofUrl}
          />

          {["Near Destination", "Delivered"].includes(viewingTrip.status) ? (
            <p className="mt-6 rounded-lg border border-secondary-container/40 bg-secondary-fixed/30 px-3 py-2 text-sm text-on-surface">
              Koodhka xaqiijinta Delivered:{" "}
              <strong className="tracking-widest">{deliveryConfirmCode(viewingTrip.id)}</strong>
              <span className="mt-1 block text-xs text-on-surface-variant">
                Sii darawalka marka alaabta laguu wareejiyo.
              </span>
            </p>
          ) : null}

          <p className="mt-4 text-sm text-on-surface-variant">
            {t("customer.tripStatusInNotifications")}{" "}
            <Link to="/customer/notifications" className="font-semibold text-secondary-container hover:underline">
              {t("nav.notifications")}
            </Link>
          </p>

          {viewingTrip.status === "Delivered" && (
            <div className="mt-6">
              <TripFeedbackForm trip={viewingTrip} onSubmitted={handleFeedbackSubmitted} />
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setViewingTrip(null)}>Close</Button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.id}`} onClose={() => setEditing(null)} wide>
          <form className="space-y-4" onSubmit={handleSubmit(onUpdate)}>
            <CargoBookingFields
              register={register}
              errors={errors}
              watch={watch}
              setValue={setValue}
              showLoadType={false}
              showContactFields
            />
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex justify-end gap-2">
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
