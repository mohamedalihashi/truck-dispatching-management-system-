import { useMemo, useState } from "react";
import { MapPin, Package, Weight } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { useAssignSharedPool, useCargoRequests, useTrucks } from "../../hooks/useApi";
import { fareAfterDelivered } from "../../utils/helpers";

function parseTons(weight) {
  const n = Number.parseFloat(String(weight || "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (String(weight).toLowerCase().includes("kg")) return n / 1000;
  return n;
}

function truckCapacityTons(truck) {
  const tons = Number(truck?.capacityTons);
  if (Number.isFinite(tons) && tons > 0) return tons;
  return parseTons(truck?.capacity);
}

function normalizePlace(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Same gobol + magalo (region + district) for pickup AND delivery. */
function sharedCorridorKey(row) {
  const fromRegion = normalizePlace(row?.fromRegion);
  const fromDistrict = normalizePlace(row?.fromDistrict);
  const toRegion = normalizePlace(row?.toRegion);
  const toDistrict = normalizePlace(row?.toDistrict);

  const from =
    fromRegion && fromDistrict
      ? `${fromRegion}::${fromDistrict}`
      : normalizePlace(row?.pickup);
  const to =
    toRegion && toDistrict
      ? `${toRegion}::${toDistrict}`
      : normalizePlace(row?.destination);

  if (!from || !to) return "";
  return `${from}=>${to}`;
}

function corridorLabel(row) {
  const from =
    [row.fromRegion, row.fromDistrict].filter(Boolean).join(" / ") || row.pickup || "—";
  const to = [row.toRegion, row.toDistrict].filter(Boolean).join(" / ") || row.destination || "—";
  return `${from} → ${to}`;
}

/** Admin: pool SHARED requests, then assign one SHARED truck (creates SharedTrip). */
export function AdminSharedTripsPage() {
  const { data, isLoading, refetch } = useCargoRequests({ loadType: "SHARED", limit: 100 });
  const { data: trucksData } = useTrucks();
  const assignPool = useAssignSharedPool();
  const fleet = trucksData?.data || [];

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [truckId, setTruckId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = data?.data || [];
  const pending = rows.filter(
    (row) =>
      !row.driverId &&
      ["Pending", "Awaiting Approval", "Approved", "Quote Rejected"].includes(row.status)
  );
  const assigned = rows.filter((row) => row.driverId);

  const sharedAvailableTrucks = useMemo(
    () =>
      fleet.filter(
        (truck) =>
          truck.status === "Available" &&
          truck.driverId &&
          (truck.driverServiceType === "SHARED" || truck.serviceType === "SHARED")
      ),
    [fleet]
  );

  const selectedRows = useMemo(
    () => pending.filter((row) => selectedIds.has(row.id)),
    [pending, selectedIds]
  );
  const selectedCorridor = selectedRows.length ? sharedCorridorKey(selectedRows[0]) : "";
  const corridorMismatch = selectedRows.some((row) => sharedCorridorKey(row) !== selectedCorridor);
  const selectedTruck = fleet.find((row) => row.id === truckId);
  const capacityTons = truckCapacityTons(selectedTruck);

  const compatiblePending = useMemo(() => {
    if (!selectedCorridor) return pending;
    return pending.filter((row) => sharedCorridorKey(row) === selectedCorridor);
  }, [pending, selectedCorridor]);

  function toggle(id) {
    const row = pending.find((r) => r.id === id);
    if (!row) return;
    setError("");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size > 0) {
        const first = pending.find((r) => next.has(r.id));
        const baseKey = first ? sharedCorridorKey(first) : "";
        const rowKey = sharedCorridorKey(row);
        if (!rowKey) {
          setError(`${id}: gobol/magalo waa loo baahan yahay si loo is raaciyo.`);
          return prev;
        }
        if (baseKey && rowKey !== baseKey) {
          setError(
            "Wadooyin kala duwan lama is raaci karo. Kaliya isku gobol + magalo (qaadis iyo geeyn) ayaa is raaci kara."
          );
          return prev;
        }
      }
      next.add(id);
      return next;
    });
  }

  function toggleAllCompatible() {
    setError("");
    if (!selectedRows.length) {
      if (!pending.length) return;
      const firstKey = sharedCorridorKey(pending[0]);
      setSelectedIds(new Set(pending.filter((row) => sharedCorridorKey(row) === firstKey).map((r) => r.id)));
      return;
    }
    if (selectedIds.size === compatiblePending.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(compatiblePending.map((row) => row.id)));
  }

  function openAssign() {
    setError("");
    setSuccess("");
    if (selectedRows.length < 2) {
      setError("Shared pool needs at least 2 loads (isku gobol + magalo).");
      return;
    }
    if (corridorMismatch || selectedRows.some((row) => !sharedCorridorKey(row))) {
      setError(
        "Wadooyin kala duwan lama is raaci karo. Dooro kaliya requests isku gobol + magalo ah."
      );
      return;
    }
    setAssignOpen(true);
  }

  async function confirmAssign() {
    const truck = selectedTruck;
    if (!truck?.driverId) {
      setError("Select a SHARED truck that has a driver.");
      return;
    }
    if (truck.driverServiceType !== "SHARED" && truck.serviceType !== "SHARED") {
      setError("Assign shared loads only to a SHARED driver/truck.");
      return;
    }
    if (truck.status !== "Available") {
      setError("Select an available SHARED truck. Busy or unavailable drivers cannot take another pool.");
      return;
    }
    if (!(capacityTons > 0)) {
      setError("Selected truck has no registered capacity (tons).");
      return;
    }
    if (selectedRows.length < 2) {
      setError("Shared pool needs at least 2 loads (isku gobol + magalo).");
      return;
    }
    if (corridorMismatch || selectedRows.some((row) => !sharedCorridorKey(row))) {
      setError(
        "Wadooyin kala duwan lama is raaci karo. Kaliya isku gobol + magalo ayaa is raaci kara."
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await assignPool.mutateAsync({
        cargoRequestIds: selectedRows.map((row) => row.id),
        truckId: truck.id,
        driverId: truck.driverId
      });
      setSelectedIds(new Set());
      setAssignOpen(false);
      setTruckId("");
      setSuccess(
        `${result?.sharedTrip?.id || "Shared trip"} created. Driver gathers loads and enters weight (kg) at pickup.`
      );
      await refetch();
    } catch (err) {
      setError(err.message || "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Shared load pool"
        subtitle="Ugu yaraan 2 request isku gobol + magalo (qaadis & geeyn) ayaa is raaci kara. Weight (kg) waxaa geliya driver pickup-ka."
        actions={
          <Button onClick={openAssign} disabled={selectedRows.length < 2 || corridorMismatch}>
            Assign to one truck ({selectedRows.length})
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-xs font-semibold uppercase text-on-surface-variant">Pending shared</p>
          <p className="mt-1 text-2xl font-bold text-primary-container">{pending.length}</p>
        </article>
        <article className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-xs font-semibold uppercase text-on-surface-variant">Selected loads</p>
          <p className="mt-1 text-2xl font-bold text-primary-container">{selectedRows.length}</p>
        </article>
        <article className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-xs font-semibold uppercase text-on-surface-variant">Already assigned</p>
          <p className="mt-1 text-2xl font-bold text-primary-container">{assigned.length}</p>
        </article>
      </div>

      {error && !assignOpen ? <p className="text-sm text-error">{error}</p> : null}
      {success ? <p className="text-sm text-secondary">{success}</p> : null}
      {selectedRows.length ? (
        <p className="rounded-xl border border-secondary-container/30 bg-secondary-container/10 px-4 py-3 text-sm text-on-surface">
          Corridor la doortay: <strong>{corridorLabel(selectedRows[0])}</strong>
          {" — "}kaliya loads-kan isku waddada ah ayaa lagu dari karaa.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <h2 className="text-lg font-semibold text-primary-container">Pending shared requests</h2>
          <button type="button" className="text-sm font-semibold text-secondary hover:underline" onClick={toggleAllCompatible}>
            {selectedIds.size && selectedIds.size === compatiblePending.length
              ? "Clear selection"
              : "Select all on same corridor"}
          </button>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading…</p>
        ) : (
          <DataTable
            rows={pending}
            empty="No pending shared requests. Customers submit from Shared booking."
            columns={[
              {
                key: "pick",
                label: "",
                render: (row) => {
                  const key = sharedCorridorKey(row);
                  const blocked =
                    Boolean(selectedCorridor) && key !== selectedCorridor && !selectedIds.has(row.id);
                  return (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      disabled={blocked || !key}
                      onChange={() => toggle(row.id)}
                      aria-label={`Select ${row.id}`}
                      title={
                        !key
                          ? "Missing gobol/magalo"
                          : blocked
                            ? "Different corridor — cannot pool together"
                            : "Select"
                      }
                    />
                  );
                }
              },
              { key: "id", label: "Request" },
              {
                key: "route",
                label: "Gobol / Magalo",
                render: (row) => (
                  <span className="inline-flex items-center gap-1 text-sm">
                    <MapPin size={14} /> {corridorLabel(row)}
                  </span>
                )
              },
              {
                key: "customer",
                label: "Customer",
                render: (row) => row.customer || "—"
              },
              {
                key: "weight",
                label: "Weight",
                render: () => (
                  <span className="inline-flex items-center gap-1 text-on-surface-variant">
                    <Weight size={14} /> Driver at pickup
                  </span>
                )
              },
              {
                key: "price",
                label: "Price",
                render: (row) => {
                  const price = row.finalPrice ?? row.quotedPrice ?? row.calculatedPrice;
                  return fareAfterDelivered(row.status, price);
                }
              },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge status={row.status} />
              }
            ]}
          />
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div className="border-b border-outline-variant px-5 py-4">
          <h2 className="text-lg font-semibold text-primary-container">Assigned shared loads</h2>
        </div>
        <DataTable
          rows={assigned}
          empty="No assigned shared loads yet."
          columns={[
            { key: "id", label: "Request" },
            {
              key: "route",
              label: "Route",
              render: (row) => corridorLabel(row)
            },
            {
              key: "driver",
              label: "Driver",
              render: (row) => row.driver || "—"
            },
            {
              key: "truck",
              label: "Truck",
              render: (row) => row.truckNumber || row.truckId || "—"
            },
            {
              key: "status",
              label: "Status",
              render: (row) => <StatusBadge status={row.status} />
            }
          ]}
        />
      </section>

      {assignOpen ? (
        <Modal title="Assign selected shared loads to one SHARED truck" onClose={() => setAssignOpen(false)}>
          <p className="mb-3 text-sm text-on-surface-variant">
            {selectedRows.length} request(s) on{" "}
            <strong>{selectedRows[0] ? corridorLabel(selectedRows[0]) : "—"}</strong>
            {" "}(minimum 2). Same gobol + magalo only. Driver Accepts the whole job once; weight at pickup.
          </p>
          <ul className="mb-4 max-h-48 space-y-2 overflow-y-auto text-xs text-on-surface-variant">
            {selectedRows.map((row) => (
              <li key={row.id} className="rounded-lg border border-outline-variant px-2 py-2">
                <p className="flex items-center gap-2">
                  <Package size={12} /> {row.id} · {corridorLabel(row)}
                </p>
              </li>
            ))}
          </ul>
          <select className="mb-2 w-full stitch-input" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
            <option value="">Select available SHARED truck / driver</option>
            {sharedAvailableTrucks.map((truck) => (
              <option key={truck.id} value={truck.id}>
                {truck.truckNumber} — {truck.driver || "No driver"} · {truck.truckType || truck.type}
                {truck.capacity || truck.capacityTons ? ` · ${truck.capacityTons || truck.capacity}` : ""}
              </option>
            ))}
          </select>
          {selectedTruck ? (
            <p className="mb-3 text-sm text-on-surface-variant">
              Truck capacity {capacityTons || "?"}t · weight checked by driver at pickup
            </p>
          ) : (
            <p className="mb-3 text-sm text-on-surface-variant">Choose a SHARED truck.</p>
          )}
          {!sharedAvailableTrucks.length ? (
            <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">
              No available SHARED trucks. Only Available trucks with a SHARED driver can take a pool assign.
            </p>
          ) : null}
          {error ? <p className="mb-3 text-sm text-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={confirmAssign} disabled={busy || !truckId || corridorMismatch || selectedRows.length < 2}>
              {busy ? "Assigning…" : "Confirm assign"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
