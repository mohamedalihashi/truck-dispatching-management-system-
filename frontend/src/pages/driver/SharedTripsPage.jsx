import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Package, Truck, Flag } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { MetricCard } from "../../components/ui/MetricCard";
import { api } from "../../services/api";
import { SharedTripDecision } from "../../components/SharedTripDecision";

function nextActionLabel(status) {
  if (status === "Assigned") return "Accept / Reject";
  if (["Open for booking", "Full", "Pickup"].includes(status)) return "Pickup loads";
  if (["In Transit", "Departed"].includes(status)) return "Deliver loads";
  if (["Delivered", "Completed"].includes(status)) return "Done";
  return "Open";
}

export function SharedTripsPage() {
  const qc = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["shared-trips-summary"],
    queryFn: () => api.sharedTripsSummary(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["shared-trips-me"],
    queryFn: () => api.listMySharedTrips({ limit: 50 }),
  });

  const cancel = useMutation({
    mutationFn: (id) => api.cancelSharedTrip(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-trips-me"] });
      qc.invalidateQueries({ queryKey: ["shared-trips-summary"] });
    },
  });

  const trips = data?.data || [];
  const active = trips.filter((t) => !["Delivered", "Completed", "Cancelled"].includes(t.status));
  const done = trips.filter((t) => ["Delivered", "Completed"].includes(t.status));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shared Trips"
        subtitle="Accept → Pickup mid mid → In Transit → Delivered mid mid"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={Truck} label="Awaiting accept" value={summary?.assigned ?? 0} tone="orange" />
        <MetricCard
          icon={Package}
          label="Active"
          value={(summary?.open ?? 0) + (summary?.full ?? 0) + (summary?.pickup ?? summary?.departed ?? 0)}
          tone="navy"
        />
        <MetricCard icon={Flag} label="Delivered" value={summary?.delivered ?? summary?.completed ?? 0} tone="green" />
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-on-surface-variant">Loading…</p>
      ) : !trips.length ? (
        <div className="rounded-xl border border-dashed border-outline-variant px-6 py-12 text-center">
          <p className="font-semibold text-on-surface">Weli ma jiraan shared trips</p>
          <p className="mt-1 text-sm text-on-surface-variant">
            Admin ayaa SHARED loads kuu qoondaynaya.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {active.length ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                Active ({active.length})
              </h2>
              <ul className="space-y-3">
                {active.map((trip) => (
                  <li
                    key={trip.id}
                    className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-on-surface">{trip.id}</p>
                          <StatusBadge status={trip.status} />
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-sm text-on-surface-variant">
                          <MapPin size={14} className="shrink-0" />
                          <span className="truncate">
                            {trip.pickup} → {trip.destination}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {trip.bookingsCount ?? 0} load(s) · Next: {nextActionLabel(trip.status)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link to={`/driver/shared-trips/${trip.id}`}>
                          <Button className="px-3 py-1 text-xs">Open</Button>
                        </Link>
                        {["Open for booking", "Full"].includes(trip.status) ? (
                          <Button
                            variant="secondary"
                            className="px-3 py-1 text-xs"
                            onClick={() => cancel.mutate(trip.id)}
                          >
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {trip.status === "Assigned" ? (
                      <div className="mt-3 border-t border-outline-variant/60 pt-3">
                        <SharedTripDecision trip={trip} compact />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {done.length ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                Completed ({done.length})
              </h2>
              <ul className="space-y-2">
                {done.map((trip) => (
                  <li
                    key={trip.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant/50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-on-surface">{trip.id}</p>
                      <p className="text-xs text-on-surface-variant">
                        {trip.pickup} → {trip.destination}
                      </p>
                    </div>
                    <Link to={`/driver/shared-trips/${trip.id}`}>
                      <Button variant="secondary" className="px-3 py-1 text-xs">
                        View
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
