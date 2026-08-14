import { useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { TripPaymentJourney } from "../../components/TripPaymentJourney";
import { AssignedTripDecision } from "../../components/AssignedTripDecision";
import { PickupWeightModal } from "../../components/PickupWeightModal";
import { DeliveryProofModal } from "../../components/DeliveryProofModal";
import { useTripActions, useTrips } from "../../hooks/useApi";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";
import { fareAfterDelivered, nextTripStatus } from "../../utils/helpers";

export function DriverJobsPage() {
  const { search } = useDashboardSearch();
  const { data: trips, isLoading: tripsLoading } = useTrips({ search: search || undefined, limit: 100 });
  const actions = useTripActions();
  const [pickupTrip, setPickupTrip] = useState(null);
  const [deliverTrip, setDeliverTrip] = useState(null);

  // FTL jobs only — SHARED child trips are accepted via Shared Trips (one Accept for the pool).
  const tripRows = (trips?.data || []).filter(
    (trip) => trip.bookingChannel !== "PHONE_ASSISTED" && String(trip.loadType || "FTL").toUpperCase() !== "SHARED"
  );
  const assigned = tripRows.filter((trip) => trip.status === "Assigned");
  const active = tripRows.filter((trip) => !["Assigned", "Delivered", "Cancelled", "Pending"].includes(trip.status));
  const history = tripRows.filter((trip) => ["Delivered", "Cancelled"].includes(trip.status));

  async function advanceTrip(trip) {
    const next = nextTripStatus(trip.status);
    if (next === "Picked Up") {
      setPickupTrip(trip);
      return;
    }
    if (next === "Delivered") {
      setDeliverTrip(trip);
      return;
    }
    try {
      await actions.updateStatus.mutateAsync({ id: trip.id, status: next });
    } catch (err) {
      alert(err.message || "Could not update trip status");
    }
  }

  async function confirmPickupWeight(payload) {
    try {
      await actions.updateStatus.mutateAsync(payload);
      setPickupTrip(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function confirmDelivered(payload) {
    await actions.updateStatus.mutateAsync(payload);
    setDeliverTrip(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="FTL Trips"
        subtitle="Accept or Reject assigned loads. At Picked Up enter weight; at Delivered upload proof of delivery."
      />

      <TripPaymentJourney />

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Needs your decision</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Assigned jobs waiting for Accept or Reject. Fare is set at Delivered (GPS km + weight).
          </p>
        </div>
        {tripsLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading trips…</p>
        ) : (
          <DataTable
            rows={assigned}
            empty="No assigned jobs waiting for your decision."
            columns={[
              { key: "id", label: "Trip" },
              {
                key: "route",
                label: "Route",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              {
                key: "fare",
                label: "Fare",
                render: (row) => fareAfterDelivered(row.status, row.fare)
              },
              {
                key: "eta",
                label: "ETA",
                render: (row) => row.estimatedTime || row.eta || "—"
              },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge status={row.status} />
              },
              {
                key: "actions",
                label: "Actions",
                render: (row) => <AssignedTripDecision trip={row} compact />
              }
            ]}
          />
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Active trips</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Advance one step at a time. Weight at Picked Up · photo proof at Delivered.
          </p>
        </div>
        {tripsLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading trips…</p>
        ) : (
          <DataTable
            rows={active}
            empty="No active trips yet. Accept an assigned job to begin."
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
              {
                key: "weight",
                label: "Weight",
                render: (row) => {
                  const w = row.cargoWeight || row.weight;
                  if (!w || /^(tbd|pending|n\/a)$/i.test(String(w).trim())) return "—";
                  return w;
                }
              },
              {
                key: "fare",
                label: "Fare",
                render: (row) => fareAfterDelivered(row.status, row.fare)
              },
              {
                key: "actions",
                label: "Actions",
                render: (row) =>
                  nextTripStatus(row.status) !== row.status ? (
                    <Button className="px-2 py-1 text-xs" onClick={() => advanceTrip(row)}>
                      Next: {nextTripStatus(row.status)}
                    </Button>
                  ) : (
                    <span className="text-xs text-on-surface-variant">—</span>
                  )
              }
            ]}
          />
        )}
      </section>

      {history.length ? (
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
          <div className="border-b border-outline-variant px-6 py-5">
            <h2 className="text-xl font-semibold text-primary-container">Recent history</h2>
          </div>
          <DataTable
            rows={history.slice(0, 20)}
            empty="No history yet."
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
              {
                key: "fare",
                label: "Fare",
                render: (row) => fareAfterDelivered(row.status, row.fare)
              }
            ]}
          />
        </section>
      ) : null}

      <PickupWeightModal
        trip={pickupTrip}
        open={Boolean(pickupTrip)}
        onClose={() => setPickupTrip(null)}
        onConfirm={confirmPickupWeight}
        pending={actions.updateStatus.isPending}
      />

      <DeliveryProofModal
        trip={deliverTrip}
        open={Boolean(deliverTrip)}
        onClose={() => setDeliverTrip(null)}
        onDelivered={confirmDelivered}
        pending={actions.updateStatus.isPending}
      />
    </div>
  );
}
