import { useRef, useState } from "react";
import { Eye, MapPin, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { TripPaymentJourney, paymentBreakdown } from "../../components/TripPaymentJourney";
import { useCargoRequests, useQuoteMutations, useTripActions, useTrips } from "../../hooks/useApi";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";
import { driverTripActionLabel, money, nextDriverTripStatus } from "../../utils/helpers";
import { api } from "../../services/api";

export function DriverJobsPage() {
  const { search } = useDashboardSearch();
  const { data: bookings, isLoading: bookingsLoading } = useCargoRequests({
    search: search || undefined,
    limit: 50
  });
  const { data: trips, isLoading: tripsLoading } = useTrips({ search: search || undefined, limit: 100 });
  const tripActions = useTripActions();
  const quotes = useQuoteMutations();
  const qc = useQueryClient();
  const proofInputRef = useRef(null);

  const [quoting, setQuoting] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [declineNote, setDeclineNote] = useState("");
  const [quotePrice, setQuotePrice] = useState("");
  const [quoteEta, setQuoteEta] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [viewingPhoneJob, setViewingPhoneJob] = useState(null);
  const [proofTripId, setProofTripId] = useState(null);

  const bookingRows = (bookings?.data || []).filter(
    (row) =>
      row.bookingChannel !== "PHONE_ASSISTED" ||
      ["Pending", "Quote Rejected", "Awaiting Approval"].includes(row.status)
  );
  const phoneJobs = (trips?.data || []).filter((trip) => trip.bookingChannel === "PHONE_ASSISTED");
  const quoteBreakdown = paymentBreakdown(quotePrice);

  async function runTripAction(successMessage, action) {
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(successMessage);
    } catch (err) {
      setError(err.message);
    }
  }

  async function rejectPhoneJob(trip) {
    if (!confirm(`Reject phone booking ${trip.cargoRequestId || trip.id}?`)) return;
    await runTripAction("Phone booking rejected and returned to the admin.", () =>
      tripActions.reject.mutateAsync(trip.id)
    );
  }

  async function uploadPhoneProof(event) {
    const file = event.target.files?.[0];
    if (!file || !proofTripId) return;
    const body = new FormData();
    body.append("proof", file);
    await runTripAction("Delivery proof uploaded.", async () => {
      await api.uploadProof(proofTripId, body);
      await qc.invalidateQueries({ queryKey: ["trips"] });
    });
    event.target.value = "";
    setProofTripId(null);
  }

  function openQuote(row) {
    setQuoting(row);
    setQuotePrice(
      row.quotedPrice != null
        ? String(row.quotedPrice)
        : row.finalPrice != null
          ? String(row.finalPrice)
          : ""
    );
    setQuoteEta(row.quotedEstimatedTime || "");
    setQuoteNotes(row.quoteNotes || "");
    setError("");
  }

  async function submitQuote(event) {
    event.preventDefault();
    if (!quoting) return;
    setError("");
    setMessage("");
    try {
      await quotes.submit.mutateAsync({
        id: quoting.id,
        payload: {
          quotedPrice: Number(quotePrice),
          quotedEstimatedTime: quoteEta.trim(),
          quoteNotes: quoteNotes.trim() || undefined
        }
      });
      setMessage(`Price & time sent for ${quoting.id}. Customer can accept or reject. Trip starts after 30% deposit.`);
      setQuoting(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitDecline(event) {
    event.preventDefault();
    if (!declining) return;
    setError("");
    setMessage("");
    try {
      await quotes.decline.mutateAsync({
        id: declining.id,
        note: declineNote.trim()
      });
      setMessage(`Booking ${declining.id} declined.`);
      setDeclining(null);
      setDeclineNote("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="FTL Trips"
        subtitle="Full truck trips: confirm price & time → customer accepts & pays 30% → you run the trip → 70% after delivery."
      />

      <TripPaymentJourney />

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

      <section className="overflow-hidden rounded-xl border border-orange-200 bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-orange-200 bg-orange-50 px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Admin Phone Bookings</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Accept or reject office bookings, navigate to pickup, and update the delivery status.
          </p>
        </div>
        {tripsLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading phone bookings…</p>
        ) : (
          <DataTable
            rows={phoneJobs}
            empty="No phone booking has been sent to you."
            columns={[
              { key: "cargoRequestId", label: "Booking" },
              {
                key: "route",
                label: "Pickup → Delivery",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              { key: "cargoWeight", label: "Weight" },
              { key: "loadType", label: "Type" },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge status={row.status} />
              },
              {
                key: "actions",
                label: "Actions",
                render: (row) => {
                  const nextStatus = nextDriverTripStatus(row.status);
                  const actionLabel = driverTripActionLabel(row.status);
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container"
                        title="View booking details"
                        onClick={() => setViewingPhoneJob(row)}
                      >
                        <Eye size={16} />
                      </button>
                      {!["Delivered", "Cancelled"].includes(row.status) && (
                        <a
                          className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-container"
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.pickup)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MapPin size={14} /> Navigate Pickup
                        </a>
                      )}
                      {row.status === "Assigned" && (
                        <>
                          <Button
                            className="px-2 py-1 text-xs"
                            disabled={tripActions.accept.isPending}
                            onClick={() =>
                              runTripAction("Phone booking accepted.", () =>
                                tripActions.accept.mutateAsync(row.id)
                              )
                            }
                          >
                            Accept
                          </Button>
                          <Button
                            variant="danger"
                            className="px-2 py-1 text-xs"
                            disabled={tripActions.reject.isPending}
                            onClick={() => rejectPhoneJob(row)}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {row.status !== "Assigned" && actionLabel && (
                        <Button
                          className="px-2 py-1 text-xs"
                          disabled={
                            tripActions.updateStatus.isPending ||
                            (nextStatus === "Delivered" && !row.deliveryProofUrl)
                          }
                          title={
                            nextStatus === "Delivered" && !row.deliveryProofUrl
                              ? "Upload delivery proof before completing delivery"
                              : undefined
                          }
                          onClick={() =>
                            runTripAction(`Status updated to ${nextStatus}.`, () =>
                              tripActions.updateStatus.mutateAsync({ id: row.id, status: nextStatus })
                            )
                          }
                        >
                          {actionLabel}
                        </Button>
                      )}
                      {row.status === "In Transit" && !row.deliveryProofUrl && (
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => {
                            setProofTripId(row.id);
                            proofInputRef.current?.click();
                          }}
                        >
                          <Upload size={14} /> Upload Delivery Proof
                        </Button>
                      )}
                    </div>
                  );
                }
              }
            ]}
          />
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Booking requests</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Confirm price and time if you accept. If you decline, give a reason. After the customer accepts, they pay 30% to start.
          </p>
        </div>
        {bookingsLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading bookings…</p>
        ) : (
          <DataTable
            rows={bookingRows}
            empty="No truck booking requests yet."
            columns={[
              { key: "id", label: "Request" },
              {
                key: "route",
                label: "Route",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              { key: "weight", label: "Weight" },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge status={row.status} />
              },
              {
                key: "offer",
                label: "Your offer",
                render: (row) =>
                  row.quotedPrice != null
                    ? `$${Number(row.quotedPrice).toLocaleString()} · ${row.quotedEstimatedTime || "—"}`
                    : "—"
              },
              {
                key: "actions",
                label: "Actions",
                render: (row) =>
                  ["Pending", "Quote Rejected"].includes(row.status) ? (
                    <div className="flex flex-wrap gap-2">
                      <Button className="px-2 py-1 text-xs" onClick={() => openQuote(row)}>
                        Confirm price & time
                      </Button>
                      <Button
                        variant="danger"
                        className="px-2 py-1 text-xs"
                        onClick={() => {
                          setDeclining(row);
                          setDeclineNote("");
                          setError("");
                        }}
                      >
                        Decline
                      </Button>
                    </div>
                  ) : row.status === "Awaiting Approval" ? (
                    <span className="text-xs text-on-surface-variant">Waiting for customer</span>
                  ) : row.status === "Assigned" ? (
                    <span className="text-xs text-on-surface-variant">Awaiting 30% deposit</span>
                  ) : null
              }
            ]}
          />
        )}
      </section>

      <input
        ref={proofInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={uploadPhoneProof}
      />

      {quoting && (
        <Modal title={`Confirm booking ${quoting.id}`} onClose={() => setQuoting(null)}>
          <p className="mb-4 text-sm text-on-surface-variant">
            {quoting.pickup} → {quoting.destination}
            {quoting.weight ? ` · ${quoting.weight}` : ""}
          </p>
          <p className="mb-4 text-xs text-on-surface-variant">
            Customer will accept or reject this offer. After accept, they pay 30% deposit before the trip can start, then 70% after delivery.
          </p>
          <form className="space-y-4" onSubmit={submitQuote}>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Price</span>
              <input className="stitch-input" type="number" min="1" step="0.01" required value={quotePrice} onChange={(e) => setQuotePrice(e.target.value)} />
            </label>
            {Number(quotePrice) > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                <div className="rounded-lg bg-surface-container px-3 py-2">
                  30% deposit: <strong>{money(quoteBreakdown.deposit)}</strong>
                </div>
                <div className="rounded-lg bg-surface-container px-3 py-2">
                  70% after delivery: <strong>{money(quoteBreakdown.balance)}</strong>
                </div>
              </div>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Estimated time</span>
              <input className="stitch-input" required placeholder="e.g. 4–5 hours" value={quoteEta} onChange={(e) => setQuoteEta(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Note (optional)</span>
              <textarea className="stitch-input min-h-[80px]" value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} />
            </label>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setQuoting(null)}>Cancel</Button>
              <Button type="submit" disabled={quotes.submit.isPending}>
                {quotes.submit.isPending ? "Sending…" : "Send price & time"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {declining && (
        <Modal title={`Decline booking ${declining.id}`} onClose={() => setDeclining(null)}>
          <p className="mb-4 text-sm text-on-surface-variant">
            Provide a reason. The customer will be notified.
          </p>
          <form className="space-y-4" onSubmit={submitDecline}>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Reason *</span>
              <textarea
                className="stitch-input min-h-[100px]"
                required
                placeholder="Truck unavailable, route not suitable…"
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
              />
            </label>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeclining(null)}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={quotes.decline.isPending}>
                {quotes.decline.isPending ? "Declining…" : "Decline booking"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {viewingPhoneJob && (
        <Modal
          title={`Phone Booking ${viewingPhoneJob.cargoRequestId || viewingPhoneJob.id}`}
          onClose={() => setViewingPhoneJob(null)}
          wide
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="Booking Type" value={viewingPhoneJob.loadType} />
            <Detail label="Status" value={<StatusBadge status={viewingPhoneJob.status} />} />
            <Detail label="Pickup Contact" value={`${viewingPhoneJob.senderName || "—"} · ${viewingPhoneJob.senderPhone || "—"}`} />
            <Detail label="Pickup Location" value={viewingPhoneJob.pickup} />
            <Detail label="Delivery Contact" value={`${viewingPhoneJob.receiverName || "—"} · ${viewingPhoneJob.receiverPhone || "—"}`} />
            <Detail label="Delivery Location" value={viewingPhoneJob.destination} />
            <Detail label="Cargo Details" value={viewingPhoneJob.cargo || "—"} />
            <Detail label="Cargo Weight" value={viewingPhoneJob.cargoWeight || "—"} />
            <Detail label="Truck" value={viewingPhoneJob.truck || "—"} />
            <Detail label="Customer" value={viewingPhoneJob.customer || "—"} />
            {viewingPhoneJob.cargoImageUrl && (
              <img
                src={viewingPhoneJob.cargoImageUrl}
                alt="Cargo"
                className="max-h-64 rounded-xl object-cover sm:col-span-2"
              />
            )}
          </dl>
        </Modal>
      )}

    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
      <dt className="text-xs font-semibold uppercase text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-medium text-on-surface">{value}</dd>
    </div>
  );
}
