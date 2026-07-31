import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Weight, Package, Truck, CheckCircle2, Navigation, Flag } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { MetricCard } from "../../components/ui/MetricCard";
import { api } from "../../services/api";
import { money } from "../../utils/helpers";
import { SharedTripJourney } from "../../components/SharedTripJourney";

export function SharedTripsPage() {
  const qc = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["shared-trips-summary"],
    queryFn: () => api.sharedTripsSummary()
  });

  const { data, isLoading } = useQuery({
    queryKey: ["shared-trips-me"],
    queryFn: () => api.listMySharedTrips({ limit: 50 })
  });

  const cancel = useMutation({
    mutationFn: (id) => api.cancelSharedTrip(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-trips-me"] });
      qc.invalidateQueries({ queryKey: ["shared-trips-summary"] });
    }
  });

  const trips = data?.data || [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Shared Trips"
        subtitle="From creating a trip to finishing the journey — follow every step."
        actions={
          <Link to="/driver/shared-trips/new">
            <Button><Plus size={16} /> New shared trip</Button>
          </Link>
        }
      />

      <SharedTripJourney />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard icon={Package} label="Total trips" value={summary?.total ?? 0} tone="navy" />
        <MetricCard icon={Truck} label="Open" value={summary?.open ?? 0} tone="blue" />
        <MetricCard icon={CheckCircle2} label="Full" value={summary?.full ?? 0} tone="green" />
        <MetricCard icon={Navigation} label="Pickup" value={summary?.pickup ?? summary?.departed ?? 0} tone="orange" />
        <MetricCard icon={Navigation} label="In Transit" value={summary?.inTransit ?? 0} tone="blue" />
        <MetricCard icon={Flag} label="Delivered" value={summary?.delivered ?? summary?.completed ?? 0} tone="green" />
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-on-surface-variant">Loading…</p>
      ) : !trips.length ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-10 text-center">
          <p className="font-semibold text-on-surface">No shared trips yet</p>
          <p className="mt-2 text-sm text-on-surface-variant">
            Start with step 1 — create a trip with open capacity for customers to book.
          </p>
          <Link to="/driver/shared-trips/new" className="mt-4 inline-block">
            <Button><Plus size={16} /> Create shared trip</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {trips.map((trip) => (
            <article key={trip.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-on-surface">{trip.id}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-on-surface-variant">
                    <MapPin size={14} /> {trip.pickup} → {trip.destination}
                  </p>
                </div>
                <StatusBadge status={trip.status} />
              </div>
              <p className="mt-2 text-sm text-on-surface-variant">
                <Weight size={14} className="inline" /> {trip.availableTons}t / {trip.totalCapacityTons}t · {trip.bookingsCount} booking(s)
              </p>
              {trip.pricePerTon != null ? <p className="text-sm text-on-surface-variant">{money(trip.pricePerTon)}/ton</p> : null}
              <SharedTripJourney status={trip.status} compact className="mt-4" />
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/driver/shared-trips/${trip.id}`}>
                  <Button variant="secondary" className="px-3 py-1 text-xs">View</Button>
                </Link>
                {trip.status === "Open for booking" ? (
                  <>
                    <Link to={`/driver/shared-trips/${trip.id}/edit`}>
                      <Button variant="secondary" className="px-3 py-1 text-xs">Edit</Button>
                    </Link>
                    <Button className="px-3 py-1 text-xs" onClick={() => cancel.mutate(trip.id)}>Cancel</Button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
