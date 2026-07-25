import { useState } from "react";
import { useForm } from "react-hook-form";
import { CheckCircle2, Clock, Eye, FileText, Pencil, Plus, RotateCcw, Trash2, Truck, XCircle } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { MetricCard } from "../../components/ui/MetricCard";
import {
  useAssignCargo,
  useCancelCargo,
  useCargoRequestSummary,
  useCargoRequests,
  useCreateCargo,
  useCustomers,
  useRestoreCargo,
  useTrucks,
  useUpdateCargo
} from "../../hooks/useApi";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";
import { useAuth } from "../../contexts/AuthContext";
import { CANCELABLE_REQUEST_STATUSES, REQUEST_STATUSES, money } from "../../utils/helpers";

const normalizeTruckType = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

export function RequestsPage() {
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [truckId, setTruckId] = useState("");
  const [error, setError] = useState("");
  const { user } = useAuth();
  const { search } = useDashboardSearch();
  const showCreate = user.role === "admin" || user.role === "dispatcher";
  const canAssign = user.role === "admin" || user.role === "dispatcher";
  const canEdit = user.role === "admin" || user.role === "dispatcher";
  const canRestore = user.role === "admin" || user.role === "dispatcher";
  const { data, isLoading } = useCargoRequests({ status: status || undefined, search: search || undefined });
  const { data: summary } = useCargoRequestSummary();
  const { data: trucks } = useTrucks();
  const { data: customers } = useCustomers({ enabled: showCreate });
  const assign = useAssignCargo();
  const cancel = useCancelCargo();
  const restore = useRestoreCargo();
  const create = useCreateCargo();
  const update = useUpdateCargo();
  const fleet = trucks?.data || [];
  const assignmentFleet = selected
    ? [...fleet].sort((a, b) => {
        const aMatch = normalizeTruckType(a.truckType || a.type) === normalizeTruckType(selected.truckType);
        const bMatch = normalizeTruckType(b.truckType || b.type) === normalizeTruckType(selected.truckType);
        return Number(bMatch) - Number(aMatch);
      })
    : fleet;

  const {
    register: registerCreate,
    handleSubmit: handleCreate,
    reset: resetCreate,
    formState: { isSubmitting: creatingForm }
  } = useForm({
    defaultValues: {
      pickup: "",
      destination: "",
      truckType: "",
      weight: "1.0 tons",
      description: "",
      customerId: ""
    }
  });

  const {
    register: registerEdit,
    handleSubmit: handleEdit,
    reset: resetEdit,
    formState: { isSubmitting: editingForm }
  } = useForm();

  function openAssign(row) {
    setSelected(row);
    const requiredType = normalizeTruckType(row.truckType);
    const matched = fleet.find(
      (truck) => truck.status === "Available" && normalizeTruckType(truck.truckType || truck.type) === requiredType
    );
    setTruckId(matched?.id || "");
    setError("");
  }

  function openEdit(row) {
    setEditing(row);
    setError("");
    resetEdit({
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

  async function onAssign() {
    setError("");
    const truck = fleet.find((t) => t.id === truckId) || fleet.find((t) => t.status === "Available");
    if (!selected || !truck) {
      setError("Select an available truck");
      return;
    }
    try {
      await assign.mutateAsync({
        id: selected.id,
        payload: { driverId: truck.driverId, truckId: truck.id, dispatcherId: user.id }
      });
      setSelected(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onCancel(id) {
    if (!confirm("Cancel this cargo request?")) return;
    try {
      await cancel.mutateAsync(id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function onRestore(id) {
    if (!confirm("Restore this cancelled request?")) return;
    try {
      await restore.mutateAsync(id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function onCreate(values) {
    setError("");
    try {
      await create.mutateAsync({ ...values, customerId: values.customerId });
      setCreating(false);
      resetCreate();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onUpdate(values) {
    setError("");
    try {
      await update.mutateAsync({ id: editing.id, payload: values });
      setEditing(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cargo Requests"
        subtitle="Bookings are auto-priced with ETA from distance (km). Assign a driver — no quotation step."
        actions={
          showCreate ? (
            <Button onClick={() => { setCreating(true); setError(""); }}>
              <Plus size={16} /> New request
            </Button>
          ) : null
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard icon={FileText} label="Total Requests" value={summary?.total ?? "—"} tone="navy" />
        <MetricCard icon={Clock} label="Total Pending" value={summary?.pending ?? "—"} tone="amber" />
        <MetricCard icon={Truck} label="Total Active" value={summary?.active ?? "—"} tone="blue" />
        <MetricCard icon={CheckCircle2} label="Total Received" value={summary?.delivered ?? "—"} tone="green" />
        <MetricCard icon={XCircle} label="Total Cancelled" value={summary?.cancelled ?? "—"} tone="soft" />
      </section>

      <div className="flex flex-wrap gap-3">
        <select
          className="stitch-input max-w-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">Request Queue</h2>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading requests…</p>
        ) : (
          <DataTable
            rows={data?.data || []}
            columns={[
              { key: "id", label: "ID" },
              { key: "customer", label: "Customer" },
              {
                key: "route",
                label: "Route",
                render: (row) => `${row.pickup} → ${row.destination}`
              },
              { key: "truckType", label: "Type" },
              { key: "weight", label: "Weight" },
              {
                key: "price",
                label: "Price",
                render: (row) => {
                  const price = row.finalPrice ?? row.calculatedPrice ?? row.quotedPrice;
                  return price != null ? money(price) : "—";
                }
              },
              {
                key: "eta",
                label: "ETA",
                render: (row) => row.quotedEstimatedTime || "—"
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
                    <button type="button" className="p-1 text-on-surface-variant" onClick={() => setViewing(row)} title="View">
                      <Eye size={16} />
                    </button>
                    {canEdit && row.status === "Pending" && (
                      <button type="button" className="p-1 text-secondary-container" onClick={() => openEdit(row)} title="Edit">
                        <Pencil size={16} />
                      </button>
                    )}
                    {canAssign &&
                      ["Pending", "Awaiting Approval", "Quote Rejected", "Approved", "Assigned"].includes(row.status) &&
                      (row.finalPrice != null || row.calculatedPrice != null || row.quotedPrice != null) && (
                      <Button className="px-2 py-1 text-xs" onClick={() => openAssign(row)}>
                        {row.status === "Assigned" ? "Reassign" : "Assign driver"}
                      </Button>
                    )}
                    {CANCELABLE_REQUEST_STATUSES.includes(row.status) && (
                      <button type="button" className="p-1 text-error" onClick={() => onCancel(row.id)} title="Cancel">
                        <Trash2 size={16} />
                      </button>
                    )}
                    {canRestore && row.status === "Cancelled" && (
                      <button
                        type="button"
                        className="p-1 text-secondary-container disabled:opacity-50"
                        onClick={() => onRestore(row.id)}
                        disabled={restore.isPending}
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

      {selected && (
        <Modal title={`${["Assigned"].includes(selected.status) ? "Reassign" : "Assign driver"} ${selected.id}`} onClose={() => setSelected(null)}>
          {(selected.finalPrice != null || selected.calculatedPrice != null || selected.quotedPrice != null) ? (
            <p className="mb-3 text-sm text-on-surface-variant">
              Price: {money(selected.finalPrice ?? selected.calculatedPrice ?? selected.quotedPrice)}
              {selected.quotedEstimatedTime
                ? ` · ETA ${selected.quotedEstimatedTime}`
                : selected.distanceKm != null
                  ? ` · ${selected.distanceKm} km (ETA auto)`
                  : ""}
            </p>
          ) : null}
          <p className="mb-2 text-sm font-medium text-on-surface-variant">
            Required truck type: <strong className="text-on-surface">{selected.truckType}</strong>
          </p>
          <select className="mb-4 w-full stitch-input" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
            <option value="">Select a matching truck</option>
            {assignmentFleet.map((truck) => {
              const matches = normalizeTruckType(truck.truckType || truck.type) === normalizeTruckType(selected.truckType);
              return (
                <option key={truck.id} value={truck.id}>
                  {matches ? "✓ " : ""}
                  {truck.truckNumber} — {truck.driver || "No driver"} · {truck.truckType || truck.type} ({truck.status})
                </option>
              );
            })}
          </select>
          {!fleet.length ? (
            <p className="mb-3 text-sm text-error">
              No trucks loaded. Check that verified drivers with trucks exist, then refresh the page.
            </p>
          ) : null}
          {fleet.length > 0 &&
          !assignmentFleet.some(
            (truck) =>
              truck.status === "Available" &&
              normalizeTruckType(truck.truckType || truck.type) === normalizeTruckType(selected.truckType)
          ) ? (
            <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">
              No available truck currently matches type &quot;{selected.truckType}&quot;. You can still pick another truck below, or register a matching truck first.
            </p>
          ) : null}
          {truckId ? (
            <p className="mb-3 text-sm text-on-surface-variant">
              Selected type: {fleet.find((truck) => truck.id === truckId)?.truckType || "Unknown"}
            </p>
          ) : null}
          {error && <p className="mb-3 text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
            <Button onClick={onAssign} disabled={assign.isPending || !fleet.length}>
              {assign.isPending ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </Modal>
      )}

      {viewing && (
        <Modal title={`Request ${viewing.id}`} onClose={() => setViewing(null)} wide>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <Detail label="Customer" value={viewing.customer} />
            <Detail label="Status" value={<StatusBadge status={viewing.status} />} />
            <Detail label="From" value={viewing.pickup} />
            <Detail label="To" value={viewing.destination} />
            <Detail
              label="Preferred pickup"
              value={
                viewing.preferredPickupDate
                  ? new Date(viewing.preferredPickupDate).toLocaleDateString()
                  : "—"
              }
            />
            <Detail label="Truck type" value={viewing.truckType} />
            <Detail label="Weight" value={viewing.weight} />
            <Detail label="Price" value={viewing.finalPrice != null || viewing.calculatedPrice != null || viewing.quotedPrice != null ? money(viewing.finalPrice ?? viewing.calculatedPrice ?? viewing.quotedPrice) : "—"} />
            <Detail label="ETA" value={viewing.quotedEstimatedTime || "—"} />
            <Detail label="Distance" value={viewing.distanceKm != null ? `${viewing.distanceKm} km` : "—"} />            <Detail label="Driver" value={viewing.driver || "—"} />
            <Detail label="Truck" value={viewing.truck || "—"} />
            <Detail label="Description" value={viewing.description} className="sm:col-span-2" />
            <Detail label="Booking customer role" value={viewing.customerRole ? `Customer is the ${viewing.customerRole.toLowerCase()}` : "—"} />
            <Detail label="Sender" value={viewing.senderName || viewing.sender || "—"} />
            <Detail label="Sender phone" value={viewing.senderPhone || "—"} />
            <Detail label="Receiver" value={viewing.receiverName || viewing.receiver || "—"} />
            <Detail label="Receiver phone" value={viewing.receiverPhone || "—"} />
            <Detail label="Instructions" value={viewing.specialInstructions || "—"} className="sm:col-span-2" />
          </dl>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.id}`} onClose={() => setEditing(null)} wide>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleEdit(onUpdate)}>
            <input className="stitch-input" placeholder="Pickup" {...registerEdit("pickup", { required: true })} />
            <input className="stitch-input" placeholder="Destination" {...registerEdit("destination", { required: true })} />
            <input className="stitch-input" placeholder="Write required truck type" {...registerEdit("truckType", { required: true })} />
            <input className="stitch-input" placeholder="Weight" {...registerEdit("weight", { required: true })} />
            <input className="stitch-input" placeholder="Sender" {...registerEdit("sender")} />
            <input className="stitch-input" placeholder="Receiver" {...registerEdit("receiver")} />
            <textarea className="stitch-input min-h-20 sm:col-span-2" placeholder="Description" {...registerEdit("description", { required: true })} />
            <textarea className="stitch-input min-h-16 sm:col-span-2" placeholder="Special instructions" {...registerEdit("specialInstructions")} />
            {error && <p className="sm:col-span-2 text-sm text-error">{error}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button disabled={editingForm || update.isPending}>Save changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {creating && (
        <Modal title="Create cargo request" onClose={() => setCreating(false)} wide>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreate(onCreate)}>
            <select className="stitch-input sm:col-span-2" {...registerCreate("customerId", { required: true })}>
              <option value="">Select customer</option>
              {(customers?.data || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
            <input className="stitch-input" placeholder="Pickup" {...registerCreate("pickup", { required: true })} />
            <input className="stitch-input" placeholder="Destination" {...registerCreate("destination", { required: true })} />
            <input className="stitch-input" placeholder="Write required truck type" {...registerCreate("truckType", { required: true })} />
            <input className="stitch-input" placeholder="Weight" {...registerCreate("weight", { required: true })} />
            <textarea className="stitch-input min-h-20 sm:col-span-2" placeholder="Description" {...registerCreate("description", { required: true })} />
            {error && <p className="sm:col-span-2 text-sm text-error">{error}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              <Button disabled={creatingForm || create.isPending}>Create request</Button>
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
