import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { CheckCircle2, Clock, Eye, FileText, Pencil, Plus, RotateCcw, Trash2, Truck, XCircle } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { MetricCard } from "../../components/ui/MetricCard";
import {
  CargoBookingFields,
  EMPTY_CARGO_BOOKING,
  bookingDefaultsFromRequest,
  buildCargoBookingPayload
} from "../../components/CargoBookingFields";
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
import { api } from "../../services/api";
import { CANCELABLE_REQUEST_STATUSES, REQUEST_STATUSES, fareAfterDelivered } from "../../utils/helpers";
import { formatTripCargoQuantity } from "../../utils/cargoMeasurement";
import { applyFormValidationIssues } from "../../utils/bookingValidation";
import { TripPhotosSection } from "../../components/ui/DocumentCard";

function truckServiceType(truck) {
  if (truck?.driverServiceType === "SHARED" || truck?.serviceType === "SHARED") return "SHARED";
  return "FTL";
}

export function RequestsPage() {
  const [status, setStatus] = useState("");
  const [loadTypeFilter, setLoadTypeFilter] = useState(() =>
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "FTL" : ""
  );
  const [selected, setSelected] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [truckId, setTruckId] = useState("");
  const [error, setError] = useState("");
  const [cargoPhoto, setCargoPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const createSubmissionKey = useRef(crypto.randomUUID());
  const { user } = useAuth();
  const { search } = useDashboardSearch();
  const showCreate = user.role === "admin";
  const canAssign = user.role === "admin";
  const canEdit = user.role === "admin";
  const canRestore = user.role === "admin";
  const { data, isLoading } = useCargoRequests({
    status: status || undefined,
    search: search || undefined,
    loadType: loadTypeFilter || undefined
  });
  const { data: summary } = useCargoRequestSummary();
  const { data: trucks } = useTrucks();
  const { data: customers } = useCustomers({ enabled: showCreate });
  const assign = useAssignCargo();
  const cancel = useCancelCargo();
  const restore = useRestoreCargo();
  const create = useCreateCargo();
  const update = useUpdateCargo();
  const fleet = trucks?.data || [];
  const requiredServiceType = selected?.loadType === "SHARED" ? "SHARED" : "FTL";
  const assignmentFleet = selected
    ? fleet
        .filter(
          (truck) =>
            truck.status === "Available" &&
            truck.driverId &&
            truckServiceType(truck) === requiredServiceType
        )
        .sort((a, b) => String(a.truckNumber || "").localeCompare(String(b.truckNumber || "")))
    : fleet;

  const {
    register: registerCreate,
    handleSubmit: handleCreate,
    reset: resetCreate,
    watch: watchCreate,
    setValue: setCreateValue,
    setError: setCreateFieldError,
    formState: { errors: createErrors, isSubmitting: creatingForm }
  } = useForm({
    defaultValues: { ...EMPTY_CARGO_BOOKING }
  });

  const {
    register: registerEdit,
    handleSubmit: handleEdit,
    reset: resetEdit,
    watch: watchEdit,
    setValue: setEditValue,
    setError: setEditFieldError,
    formState: { errors: editErrors, isSubmitting: editingForm }
  } = useForm();

  function clearCreatePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setCargoPhoto(null);
    setPhotoPreview("");
    setPhotoError("");
  }

  function selectCreatePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setCargoPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoError("");
  }

  function closeCreate() {
    clearCreatePhoto();
    resetCreate({ ...EMPTY_CARGO_BOOKING });
    setCreating(false);
    setError("");
    createSubmissionKey.current = crypto.randomUUID();
  }

  function openAssign(row) {
    if (row.loadType === "SHARED") {
      setSelected(row);
      setTruckId("");
      setError("");
      return;
    }
    setSelected(row);
    const matched = fleet.find(
      (truck) =>
        truck.status === "Available" &&
        truck.driverId &&
        truckServiceType(truck) === "FTL"
    );
    setTruckId(matched?.id || "");
    setError("");
  }

  function openEdit(row) {
    setEditing(row);
    setError("");
    resetEdit(bookingDefaultsFromRequest(row));
  }

  async function onAssign() {
    setError("");
    if (selected?.loadType === "SHARED") {
      setError("SHARED loads are assigned from Shared Loads to a SHARED driver only.");
      return;
    }
    const truck = assignmentFleet.find((t) => t.id === truckId);
    if (!selected || !truck) {
      setError("Select an available FTL truck. Shared drivers cannot take FTL loads.");
      return;
    }
    if (truckServiceType(truck) !== "FTL") {
      setError("FTL loads can only be assigned to an FTL driver.");
      return;
    }
    if (truck.status !== "Available") {
      setError("This truck/driver is busy or unavailable. Choose an available truck.");
      return;
    }
    try {
      await assign.mutateAsync({
        id: selected.id,
        payload: {
          driverId: truck.driverId,
          truckId: truck.id
        }
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
    setPhotoError("");
    if (!cargoPhoto) {
      setPhotoError("Cargo photo is required");
      return;
    }
    try {
      const payload = {
        ...buildCargoBookingPayload(values, { requireCustomer: true }),
        submissionKey: createSubmissionKey.current
      };
      const request = await create.mutateAsync(payload);
      setUploadingImage(true);
      try {
        const formData = new FormData();
        formData.append("cargoImage", cargoPhoto);
        await api.uploadCargoImage(request.id, formData);
      } catch (uploadError) {
        setError(uploadError.message || "Cargo photo upload failed");
        return;
      } finally {
        setUploadingImage(false);
      }
      closeCreate();
    } catch (err) {
      if (err.issues) applyFormValidationIssues(setCreateFieldError, err.issues);
      setError(err.details?.issues?.[0]?.message || err.message);
    }
  }

  async function onUpdate(values) {
    setError("");
    try {
      const payload = buildCargoBookingPayload({
        ...values,
        loadType: editing.loadType === "SHARED" ? "SHARED" : values.loadType || "FTL"
      });
      // Keep existing load type on edit; do not reassign customer
      delete payload.customerId;
      payload.loadType = editing.loadType || payload.loadType;
      await update.mutateAsync({ id: editing.id, payload });
      setEditing(null);
    } catch (err) {
      if (err.issues) applyFormValidationIssues(setEditFieldError, err.issues);
      setError(err.details?.issues?.[0]?.message || err.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={user.role === "admin" ? "Customer requests" : "Cargo Requests"}
        subtitle={
          user.role === "admin"
            ? "FTL bookings: assign FTL drivers only. SHARED loads go to Shared Loads → SHARED drivers."
            : "Submit requests and wait for admin assignment. You do not contact drivers directly. Pay 100% after Delivered."
        }
        actions={
          showCreate ? (
            <Button onClick={() => {
              resetCreate({ ...EMPTY_CARGO_BOOKING });
              clearCreatePhoto();
              createSubmissionKey.current = crypto.randomUUID();
              setError("");
              setCreating(true);
            }}>
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
        {user.role === "admin" ? (
          <select
            className="stitch-input max-w-xs"
            value={loadTypeFilter}
            onChange={(e) => setLoadTypeFilter(e.target.value)}
          >
            <option value="FTL">FTL only (assign FTL drivers)</option>
            <option value="SHARED">SHARED only (use Shared Loads to assign)</option>
            <option value="">All load types</option>
          </select>
        ) : null}
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
              {
                key: "loadType",
                label: "Type",
                render: (row) => row.loadType || "FTL"
              },
              {
                key: "cargoType",
                label: "Cargo type",
                render: (row) => row.cargoType || row.description || "—"
              },
              { key: "weight", label: "Weight" },
              {
                key: "price",
                label: "Price",
                render: (row) => {
                  const price = row.finalPrice ?? row.quotedPrice ?? row.calculatedPrice;
                  return fareAfterDelivered(row.status, price);
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
                      !row.driverId &&
                      ["Pending", "Awaiting Approval", "Quote Rejected", "Approved", "Assigned"].includes(row.status) && (
                      row.loadType === "SHARED" ? (
                        <Link to="/admin/shared-trips" className="inline-flex">
                          <Button className="px-2 py-1 text-xs" type="button">
                            Assign via Shared
                          </Button>
                        </Link>
                      ) : (
                      <Button className="px-2 py-1 text-xs" onClick={() => openAssign(row)}>
                        Assign FTL driver
                      </Button>
                      )
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
        <Modal
          title={
            selected.loadType === "SHARED"
              ? `SHARED load ${selected.id}`
              : `${["Assigned"].includes(selected.status) ? "Reassign" : "Assign FTL driver"} ${selected.id}`
          }
          onClose={() => setSelected(null)}
        >
          {selected.loadType === "SHARED" ? (
            <>
              <p className="mb-3 text-sm text-on-surface-variant">
                SHARED loads can only be assigned to a <strong>SHARED driver</strong> from{" "}
                <Link className="underline" to="/admin/shared-trips">Shared Loads</Link> (pool assign).
              </p>
              {error && <p className="mb-3 text-sm text-error">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
                <Link to="/admin/shared-trips">
                  <Button type="button">Open Shared Loads</Button>
                </Link>
              </div>
            </>
          ) : (
            <>
          <p className="mb-3 text-sm text-on-surface-variant">
            Assign an available <strong>FTL</strong> driver/truck only. Fare is set automatically at Delivered (GPS km + pickup weight).
          </p>
          <p className="mb-3 text-sm font-medium text-on-surface-variant">
            Cargo type: <strong className="text-on-surface">{selected.cargoType || selected.description || "—"}</strong>
          </p>
          <select className="mb-4 w-full stitch-input" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
            <option value="">Select available FTL truck / driver</option>
            {assignmentFleet.map((truck) => (
              <option key={truck.id} value={truck.id}>
                {truck.truckNumber} — {truck.driver || "No driver"} · FTL · {truck.truckType || truck.type}
              </option>
            ))}
          </select>
          {!fleet.length ? (
            <p className="mb-3 text-sm text-error">
              No trucks loaded. Check that active drivers with trucks exist, then refresh the page.
            </p>
          ) : null}
          {fleet.length > 0 && !assignmentFleet.length ? (
            <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">
              No available FTL trucks right now. Shared drivers cannot take FTL loads.
            </p>
          ) : null}
          {fleet.some((truck) => truck.status === "Busy" || truck.status === "Unavailable") ? (
            <p className="mb-3 text-xs text-on-surface-variant">
              Busy / unavailable trucks are hidden from this list until they become Available.
            </p>
          ) : null}
          {truckId ? (
            <p className="mb-3 text-sm text-on-surface-variant">
              Selected truck: {fleet.find((truck) => truck.id === truckId)?.truckNumber || "—"} ·{" "}
              {fleet.find((truck) => truck.id === truckId)?.truckType || "Unknown"} · FTL
            </p>
          ) : null}
          {error && <p className="mb-3 text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
            <Button onClick={onAssign} disabled={assign.isPending || !assignmentFleet.length || !truckId}>
              {assign.isPending ? "Saving…" : "Confirm"}
            </Button>
          </div>
            </>
          )}
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
            <Detail label="Type" value={viewing.loadType || "FTL"} />
            <Detail label="Cargo type / Nooca alaabta" value={viewing.cargoType || viewing.description || "—"} />
            <Detail
              label="Quantity / Tirada"
              value={
                formatTripCargoQuantity(viewing) !== "—"
                  ? formatTripCargoQuantity(viewing)
                  : "Pending — driver enters at pickup"
              }
            />
            <Detail label="Price" value={fareAfterDelivered(viewing.status, viewing.finalPrice ?? viewing.quotedPrice)} />
            <Detail label="ETA" value={viewing.quotedEstimatedTime || "—"} />
            <Detail label="Distance" value={viewing.distanceKm != null ? `${viewing.distanceKm} km` : "—"} />            <Detail label="Driver" value={viewing.driver || "—"} />
            <Detail label="Truck" value={viewing.truck || "—"} />
            <Detail label="Description" value={viewing.description} className="sm:col-span-2" />
            <Detail label="Instructions" value={viewing.specialInstructions || "—"} className="sm:col-span-2" />
          </dl>
          <TripPhotosSection cargoImageUrl={viewing.cargoImageUrl} />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.id}`} onClose={() => setEditing(null)} wide>
          <form className="space-y-4" onSubmit={handleEdit(onUpdate)}>
            <CargoBookingFields
              register={registerEdit}
              errors={editErrors}
              watch={watchEdit}
              setValue={setEditValue}
              showLoadType={false}
            />
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button disabled={editingForm || update.isPending}>Save changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {creating && (
        <Modal title="Create cargo request" onClose={closeCreate} wide>
          <form className="space-y-4" onSubmit={handleCreate(onCreate)}>
            <p className="text-sm text-on-surface-variant">
              Same flow as customer booking: Somalia locations, cargo type, and photo. Weight is set at pickup.
            </p>
            <CargoBookingFields
              register={registerCreate}
              errors={createErrors}
              watch={watchCreate}
              setValue={setCreateValue}
              customers={customers?.data}
              showContactFields
              photoPreview={photoPreview}
              photoError={photoError}
              onSelectPhoto={selectCreatePhoto}
              onClearPhoto={clearCreatePhoto}
              requirePhoto
            />
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeCreate}>Cancel</Button>
              <Button disabled={creatingForm || create.isPending || uploadingImage}>
                {uploadingImage ? "Uploading photo…" : create.isPending ? "Creating…" : "Create request"}
              </Button>
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
