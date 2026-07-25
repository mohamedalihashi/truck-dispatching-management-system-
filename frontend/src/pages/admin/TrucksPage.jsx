import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ChevronDown, Pencil, Plus, Trash2, Truck, Wrench } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { useTruckMutations, useTruckSummary, useTrucks, useDrivers } from "../../hooks/useApi";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { MetricCard } from "../../components/ui/MetricCard";
import { somaliaLocations, somaliaRegions } from "../../data/somaliaLocations";

export function TrucksPage() {
  const navigate = useNavigate();
  const { search } = useDashboardSearch();
  const { data, isLoading } = useTrucks({ search: search || undefined });
  const { data: summary } = useTruckSummary();
  const { data: drivers } = useDrivers();
  const mutations = useTruckMutations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: { truckType: "", capacity: "12 tons", status: "Available" }
  });
  const truckRegion = watch("region");
  const truckCities = somaliaLocations[truckRegion] || [];

  const assignedDriverIds = new Set((data?.data || []).map((t) => t.driverId));
  const availableDrivers = (drivers?.data || []).filter((d) => !assignedDriverIds.has(d.id) || editing?.driverId === d.id);

  function openCreate() {
    navigate("/admin/trucks", { state: { openCreate: true } });
  }

  function openEdit(truck) {
    setEditing(truck);
    setError("");
    reset({
      truckNumber: truck.truckNumber,
      plateNumber: truck.plateNumber,
      capacity: truck.capacity,
      truckType: truck.type || truck.truckType,
      region: truck.region || "",
      city: truck.city || "",
      status: truck.status,
      driverId: truck.driverId
    });
    setOpen(true);
  }

  async function onSubmit(values) {
    setError("");
    try {
      if (editing) {
        await mutations.update.mutateAsync({
          id: editing.id,
          payload: {
            truckNumber: values.truckNumber,
            plateNumber: values.plateNumber,
            capacity: values.capacity,
            truckType: values.truckType,
            region: values.region,
            city: values.city,
            status: values.status,
            driverId: values.driverId
          }
        });
      } else {
        await mutations.create.mutateAsync({
          truckNumber: values.truckNumber,
          plateNumber: values.plateNumber,
          capacity: values.capacity,
          truckType: values.truckType,
          region: values.region,
          city: values.city,
          driverId: values.driverId,
          status: values.status || "Available"
        });
      }
      setOpen(false);
      setEditing(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onDelete(id) {
    if (!confirm("Delete this truck?")) return;
    try {
      await mutations.remove.mutateAsync(id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function setStatus(id, status) {
    try {
      await mutations.update.mutateAsync({ id, payload: { status } });
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Fleet status"
        subtitle="Update truck availability. To register a new truck with a driver, use Fleet / Drivers → Add Truck."
        actions={
          <Button onClick={openCreate}>
            <Plus size={16} /> Add Truck
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricCard icon={Truck} label="Total Trucks" value={summary?.total ?? "—"} tone="navy" />
        <MetricCard icon={Truck} label="Total Busy" value={summary?.busy ?? "—"} tone="blue" />
        <MetricCard icon={Wrench} label="Total Maintenance" value={summary?.maintenance ?? "—"} tone="amber" />
      </section>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">All Trucks</h2>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">Loading fleet…</p>
        ) : (
          <DataTable
            rows={data?.data || []}
            columns={[
              { key: "truckNumber", label: "Truck" },
              { key: "plateNumber", label: "Plate" },
              { key: "city", label: "City", render: (row) => [row.city, row.region].filter(Boolean).join(", ") || "—" },
              { key: "type", label: "Type" },
              { key: "capacity", label: "Capacity" },
              { key: "driver", label: "Driver" },
              {
                key: "driverPhone",
                label: "Driver Phone",
                render: (row) => row.driverPhone || "—"
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
                    <button type="button" className="p-1 text-secondary-container" onClick={() => openEdit(row)}>
                      <Pencil size={16} />
                    </button>
                    <button type="button" className="p-1 text-error" onClick={() => onDelete(row.id)}>
                      <Trash2 size={16} />
                    </button>
                    <label
                      className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-outline-variant text-primary-container hover:bg-surface-container"
                      title="Change truck status"
                    >
                      <span className="sr-only">Change truck status</span>
                      <ChevronDown size={16} aria-hidden="true" />
                      <select
                        className="absolute inset-0 cursor-pointer opacity-0"
                        value={row.status}
                        onChange={(event) => setStatus(row.id, event.target.value)}
                        disabled={mutations.update.isPending}
                        aria-label={`Change status for ${row.truckNumber}`}
                      >
                        <option value="Available">Available</option>
                        <option value="Busy">Busy</option>
                        <option value="Maintenance">Maintenance</option>
                      </select>
                    </label>
                  </div>
                )
              }
            ]}
          />
        )}
      </section>

      {open && (
        <Modal title={editing ? "Edit truck" : "Add truck"} onClose={() => setOpen(false)} wide>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
            <input className="stitch-input" placeholder="Truck number" {...register("truckNumber", { required: true })} />
            <input className="stitch-input" placeholder="Plate number" {...register("plateNumber", { required: true })} />
            <input className="stitch-input" placeholder="Capacity" {...register("capacity", { required: true })} />
            <input className="stitch-input" placeholder="Write truck type" {...register("truckType", { required: true })} />
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Region *</span>
              <select
                className="stitch-input"
                {...register("region", { required: true, onChange: () => setValue("city", "") })}
              >
                <option value="">Select region</option>
                {somaliaRegions.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-on-surface-variant">City / District *</span>
              <select
                className="stitch-input disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!truckRegion}
                {...register("city", { required: true })}
              >
                <option value="">{truckRegion ? "Select city" : "Select region first"}</option>
                {truckCities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </label>
            <select className="stitch-input sm:col-span-2" {...register("driverId", { required: true })}>
              <option value="">Select driver</option>
              {availableDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} ({driver.email})
                </option>
              ))}
            </select>
            <select className="stitch-input" {...register("status")}>
              <option value="Available">Available</option>
              <option value="Busy">Busy</option>
              <option value="Maintenance">Maintenance</option>
            </select>
            {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={isSubmitting || mutations.create.isPending || mutations.update.isPending}>
                {editing ? "Save changes" : "Create truck"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
