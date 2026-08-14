import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, MapPin, Pencil, Phone, Plus, Truck, UserCheck, UserX, Users } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { DataTable } from "../../components/ui/DataTable";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { MetricCard } from "../../components/ui/MetricCard";
import { DocumentCard, DocumentsGrid } from "../../components/ui/DocumentCard";
import { useUserMutations, useUserSummary, useUsers } from "../../hooks/useApi";
import { useDashboardSearch } from "../../hooks/useDashboardSearch";
import { useAuth } from "../../contexts/AuthContext";
import { somaliaLocations, somaliaRegions } from "../../data/somaliaLocations";
import { FULL_NAME_PATTERN } from "../../utils/helpers";

/** mode="fleet" → Fleet / Drivers. mode="customers" → Customers. */
export function UsersPage({ mode } = {}) {
  const { user: authUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isFleet = mode === "fleet";
  const isCustomersMode = mode === "customers";
  const [role, setRole] = useState(isFleet ? "driver" : isCustomersMode ? "customer" : "");
  const { search, hasSearch } = useDashboardSearch();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [createInfo, setCreateInfo] = useState("");
  const [truckPhoto1, setTruckPhoto1] = useState(null);
  const [driverImage, setDriverImage] = useState(null);
  const [driverLicenseDocument, setDriverLicenseDocument] = useState(null);
  const [truckDocuments, setTruckDocuments] = useState([]);
  const [serviceType, setServiceType] = useState("FTL");
  const [photo1Preview, setPhoto1Preview] = useState("");
  const listRole = isFleet ? "driver" : isCustomersMode ? "customer" : role || undefined;
  const { data, isLoading } = useUsers({ role: listRole, search: search || undefined });
  const { data: summary } = useUserSummary();
  const mutations = useUserMutations();
  const rows = data?.data || [];
  const customerActiveCount = isCustomersMode
    ? rows.filter((row) => row.status === "Active").length
    : 0;
  const customerInactiveCount = isCustomersMode
    ? rows.filter((row) => row.status !== "Active").length
    : 0;
  const { register, handleSubmit, watch, reset, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: {
      role: isFleet ? "driver" : "customer",
      truckType: "",
      capacity: "12 tons"
    }
  });
  const selectedRole = isFleet ? "driver" : isCustomersMode ? "customer" : watch("role");
  const truckRegion = watch("region");
  const truckCities = somaliaLocations[truckRegion] || [];

  function openCreate() {
    setEditing(null);
    setError("");
    setCreateInfo("");
    setTruckPhoto1(null);
    setDriverImage(null);
    setDriverLicenseDocument(null);
    setTruckDocuments([]);
    setPhoto1Preview("");
    reset({
      role: isFleet ? "driver" : "customer",
      truckType: "",
      capacity: "12 tons"
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!location.state?.openCreate) return;
    openCreate();
    navigate(".", { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openCreate]);

  function openEdit(user) {
    if (user.isSuperAdmin && !authUser.isSuperAdmin) {
      setError("Only the Super Admin can edit this account.");
      return;
    }
    setEditing(user);
    setError("");
    setCreateInfo("");
    setTruckPhoto1(null);
    setDriverImage(null);
    setDriverLicenseDocument(null);
    setTruckDocuments([]);
    setPhoto1Preview("");
    reset({
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      role: user.role,
      password: "",
      driverLicense: user.driverLicense || "",
      truckNumber: user.truckNumber || "",
      plateNumber: user.plateNumber || "",
      capacity: user.capacity || "12 tons",
      truckType: user.truckType || "",
      region: user.region || "",
      city: user.city || user.customerProfile?.city || "",
      address: user.customerProfile?.address || "",
      truckStatus: (user.truckStatus || "Available").replace(/_/g, " ")
    });
    setOpen(true);
  }

  async function onSubmit(values) {
    setError("");
    try {
      if (editing) {
        const payload = {
          name: values.name,
          email: values.email,
          phone: values.phone || undefined,
          role: values.role
        };
        if (values.password) payload.password = values.password;

        const editRole = editing.role || values.role;
        if (editRole === "driver" || isFleet) {
          if (!values.region?.trim() || !values.city?.trim()) {
            setError("Region and city are required for the driver and truck.");
            return;
          }
          payload.driverLicense = values.driverLicense?.trim() || undefined;
          payload.truck = {
            plateNumber: values.plateNumber?.trim(),
            capacity: values.capacity?.trim(),
            truckType: values.truckType?.trim(),
            region: values.region.trim(),
            city: values.city.trim(),
            ...(values.truckStatus ? { status: values.truckStatus } : {})
          };
          if (editing.truckNumber) payload.truck.truckNumber = editing.truckNumber;
        }
        if (editRole === "customer" || isCustomersMode) {
          payload.customerProfile = {
            city: values.city?.trim() || "",
            address: values.address?.trim() || ""
          };
        }

        await mutations.update.mutateAsync({ id: editing.id, payload });
      } else {
        let result;
        const createRole = isFleet ? "driver" : isCustomersMode ? "customer" : values.role;
        if (createRole === "driver") {
          if (!truckPhoto1 || !driverImage || !driverLicenseDocument || truckDocuments.length === 0) {
            setError("Driver license document, driver photo, one truck photo, and at least one truck document are required.");
            return;
          }
          if (!values.region?.trim() || !values.city?.trim()) {
            setError("Region and city are required for the driver and truck.");
            return;
          }
          const formData = new FormData();
          formData.append("name", values.name);
          formData.append("username", values.username);
          formData.append("email", values.email);
          formData.append("role", createRole);
          if (values.phone) formData.append("phone", values.phone);
          formData.append("driverLicense", values.driverLicense);
          formData.append("plateNumber", values.plateNumber);
          formData.append("capacity", values.capacity);
          formData.append("truckType", values.truckType);
          formData.append("city", values.city?.trim() || "");
          formData.append("region", values.region?.trim() || "");
          formData.append("serviceType", serviceType);
          formData.append("truckPhoto1", truckPhoto1);
          formData.append("driverImage", driverImage);
          formData.append("driverLicenseDocument", driverLicenseDocument);
          truckDocuments.forEach((file) => formData.append("truckDocuments", file));
          result = await mutations.create.mutateAsync(formData);
        } else if (createRole === "customer") {
          if (!values.phone?.trim()) {
            setError("Phone is required for customers.");
            return;
          }
          if (!values.city?.trim() || !values.address?.trim()) {
            setError("City and address are required.");
            return;
          }
          const formData = new FormData();
          formData.append("name", values.name);
          formData.append("username", values.username);
          formData.append("email", values.email);
          formData.append("phone", values.phone.trim());
          formData.append("role", "customer");
          formData.append("city", values.city.trim());
          formData.append("address", values.address.trim());
          result = await mutations.create.mutateAsync(formData);
        } else {
          const payload = {
            name: values.name,
            username: values.username,
            email: values.email,
            role: values.role,
            phone: values.phone || undefined
          };
          result = await mutations.create.mutateAsync(payload);
        }
        const parts = [result.message || "User created."];
        if (result.devPassword) {
          parts.push(`Temporary password: ${result.devPassword}`);
        } else if (result.credentialsEmailed) {
          parts.push(`Password emailed to ${values.email}.`);
        }
        const truckId = result.user?.truckNumber || result.truckNumber;
        if (truckId) parts.push(`Truck ID: ${truckId}`);
        setCreateInfo(parts.join(" "));
      }
      setOpen(false);
      setEditing(null);
      reset();
    } catch (err) {
      const details = err.details;
      const issueMessage = details?.issues?.[0]?.message;
      const fieldErrors = details?.fieldErrors
        ? Object.values(details.fieldErrors).flat().filter(Boolean)
        : [];
      setError(issueMessage || fieldErrors[0] || err.message);
    }
  }

  async function onToggleStatus(user) {
    if (user.isSuperAdmin && !authUser.isSuperAdmin) {
      alert("Only the Super Admin can change this account.");
      return false;
    }
    if (user.id === authUser.id) {
      alert("You cannot deactivate your own account.");
      return false;
    }
    if (user.role === "admin" && !authUser.isSuperAdmin) {
      alert("Only the Super Admin can change admin account status.");
      return false;
    }

    const isPendingDriver =
      user.role === "driver" && String(user.status || "").toLowerCase().includes("pending");

    if (isPendingDriver) {
      if (!confirm(`Activate ${user.name}?`)) return false;
      try {
        await mutations.verifyDriver.mutateAsync(user.id);
        return true;
      } catch (err) {
        alert(err.message);
        return false;
      }
    }

    const nextStatus = user.status === "Active" ? "Inactive" : "Active";
    const action = nextStatus === "Inactive" ? "deactivate" : "activate";
    if (!confirm(`${action.charAt(0).toUpperCase()}${action.slice(1)} ${user.name}?`)) return false;

    try {
      await mutations.update.mutateAsync({ id: user.id, payload: { status: nextStatus } });
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    }
  }

  function canToggleStatus(user) {
    if (user.isSuperAdmin) return authUser.isSuperAdmin && user.id !== authUser.id;
    if (user.role === "admin") return authUser.isSuperAdmin && user.id !== authUser.id;
    return user.id !== authUser.id;
  }

  function statusActionLabel(user) {
    if (user.role === "driver" && String(user.status || "").toLowerCase().includes("pending")) {
      return "Activate";
    }
    return user.status === "Active" ? "Deactivate" : "Activate";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={isFleet ? "Fleet / Drivers" : isCustomersMode ? "Customers" : "Users"}
        subtitle={
          isFleet
            ? "Register a driver together with their truck, photos, and documents."
            : isCustomersMode
              ? "Register customers so you can create cargo requests on their behalf."
              : "Manage admins, customers, and driver-truck accounts."
        }
        actions={
          <Button onClick={openCreate}>
            <Plus size={16} /> {isFleet ? "Add Truck" : isCustomersMode ? "Add Customer" : "Add user"}
          </Button>
        }
      />

      {createInfo && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {createInfo}
        </p>
      )}

      <section className={`grid grid-cols-2 gap-3 ${isCustomersMode ? "md:grid-cols-3" : isFleet ? "md:grid-cols-2" : "md:grid-cols-3 xl:grid-cols-4"}`}>
        {isFleet ? (
          <>
            <MetricCard icon={Users} label="Total Drivers" value={summary?.drivers ?? "—"} tone="navy" />
            <MetricCard icon={Truck} label="Fleet Trucks" value={summary?.trucks ?? "—"} tone="soft" />
          </>
        ) : isCustomersMode ? (
          <>
            <MetricCard icon={Users} label="Total Customers" value={summary?.customers ?? rows.length ?? "—"} tone="blue" />
            <MetricCard icon={UserCheck} label="Active" value={isLoading ? "—" : customerActiveCount} tone="green" />
            <MetricCard icon={Users} label="Inactive" value={isLoading ? "—" : customerInactiveCount} tone="soft" />
          </>
        ) : (
          <>
            <MetricCard icon={Users} label="Total Users" value={summary?.total ?? "—"} tone="navy" />
            <MetricCard icon={Users} label="Total Customers" value={summary?.customers ?? "—"} tone="blue" />
            <MetricCard icon={Truck} label="Total Trucks" value={summary?.trucks ?? "—"} tone="soft" />
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {hasSearch ? (
          <p className="text-sm text-on-surface-variant">
            Showing results for <span className="font-semibold text-on-surface">&quot;{search}&quot;</span>
          </p>
        ) : null}
        {!isFleet && !isCustomersMode ? (
          <select
            className="stitch-input max-w-xs"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="customer">Customer</option>
            <option value="driver">Driver</option>
          </select>
        ) : null}
      </div>

      {isCustomersMode ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-on-surface">All customers</h2>
            <p className="text-sm text-on-surface-variant">{isLoading ? "…" : `${rows.length} shown`}</p>
          </div>
          {isLoading ? (
            <p className="rounded-xl border border-outline-variant bg-surface-container-lowest py-10 text-center text-sm text-on-surface-variant">
              Loading customers…
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest py-12 text-center text-sm text-on-surface-variant">
              No customers yet. Use Add Customer to register one.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tertiary-container/15 text-sm font-bold text-on-tertiary-container">
                        {row.name?.charAt(0)?.toUpperCase() || "C"}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-on-surface">{row.name}</h3>
                        <p className="truncate text-xs text-on-surface-variant">{row.email}</p>
                      </div>
                    </div>
                    <StatusBadge status={row.status || "Active"} />
                  </div>

                  <div className="space-y-1.5 text-xs text-on-surface-variant">
                    <p className="flex items-center gap-1.5">
                      <Phone size={13} className="shrink-0" />
                      <span className="truncate">{row.phone || "No phone"}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <MapPin size={13} className="shrink-0" />
                      <span className="truncate">
                        {[row.customerProfile?.city, row.customerProfile?.address].filter(Boolean).join(" · ") || "No address"}
                      </span>
                    </p>
                  </div>

                  <div className="mt-auto flex items-center gap-2 border-t border-outline-variant pt-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-surface-container"
                      onClick={() => setViewing(row)}
                    >
                      <Eye size={14} /> View
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-secondary-container transition hover:bg-secondary-fixed"
                      onClick={() => openEdit(row)}
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    {canToggleStatus(row) ? (
                      <button
                        type="button"
                        className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                          row.status === "Active"
                            ? "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                            : "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                        }`}
                        onClick={() => onToggleStatus(row)}
                        title={statusActionLabel(row)}
                      >
                        {row.status === "Active" ? <UserX size={14} /> : <UserCheck size={14} />}
                        {statusActionLabel(row)}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
          <div className="border-b border-outline-variant px-6 py-5">
            <h2 className="text-xl font-semibold text-on-surface">
              {isFleet ? "Drivers & trucks" : "Directory"}
            </h2>
          </div>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">
              {isFleet ? "Loading fleet…" : "Loading users…"}
            </p>
          ) : (
            <DataTable
              rows={rows}
              columns={[
                { key: "name", label: "Name" },
                { key: "email", label: "Email" },
                ...(!isFleet ? [{
                  key: "role",
                  label: "Role",
                  render: (row) => row.isSuperAdmin ? "Super Admin" : row.role
                }] : [
                  { key: "truckNumber", label: "Truck ID", render: (row) => row.truckNumber || "—" },
                  { key: "plateNumber", label: "Plate", render: (row) => row.plateNumber || "—" },
                  { key: "city", label: "City", render: (row) => [row.city, row.region].filter(Boolean).join(", ") || "—" },
                  { key: "truckType", label: "Type", render: (row) => row.truckType || "—" },
                  {
                    key: "truckStatus",
                    label: "Truck status",
                    render: (row) => row.truckStatus ? <StatusBadge status={row.truckStatus} /> : "—"
                  }
                ]),
                {
                  key: "phone",
                  label: "Phone",
                  render: (row) => row.phone || "—"
                },
                {
                  key: "status",
                  label: "Status",
                  render: (row) => <StatusBadge status={row.status || "Active"} />
                },
                {
                  key: "actions",
                  label: "",
                  render: (row) => (
                    <div className="flex gap-2">
                      <button type="button" className="text-on-surface-variant" onClick={() => setViewing(row)} title="View">
                        <Eye size={16} />
                      </button>
                      {(!row.isSuperAdmin || authUser.isSuperAdmin) && (
                        <button type="button" className="text-secondary-container" onClick={() => openEdit(row)} title="Edit">
                          <Pencil size={16} />
                        </button>
                      )}
                      {canToggleStatus(row) ? (
                        <button
                          type="button"
                          className={row.status === "Active" ? "text-amber-700" : "text-emerald-700"}
                          onClick={() => onToggleStatus(row)}
                          title={statusActionLabel(row)}
                        >
                          {row.status === "Active" ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                      ) : null}
                    </div>
                  )
                }
              ]}
            />
          )}
        </section>
      )}

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)} wide>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <Detail label="Email" value={viewing.email} />
            <Detail label="Phone" value={viewing.phone || "—"} />
            <Detail label="Role" value={viewing.isSuperAdmin ? "Super Admin" : viewing.role} />
            <Detail label="Status" value={<StatusBadge status={viewing.status || "Active"} />} />

            {viewing.role === "driver" ? (
              <>
                <Detail label="Truck ID" value={viewing.truckNumber || "—"} />
                <Detail label="Plate" value={viewing.plateNumber || "—"} />
                <Detail label="Region" value={viewing.region || "—"} />
                <Detail label="City" value={viewing.city || "—"} />
                <Detail label="Truck type" value={viewing.truckType || "—"} />
                <Detail label="Capacity" value={viewing.capacity || "—"} />
                <Detail label="Truck status" value={viewing.truckStatus ? <StatusBadge status={viewing.truckStatus} /> : "—"} />
                <Detail label="Driver license no." value={viewing.driverLicense || "—"} />
                <Detail label="National ID" value={viewing.nationalIdNumber || "—"} />
              </>
            ) : null}

            {viewing.role === "customer" ? (
              <>
                <Detail label="City" value={viewing.customerProfile?.city || "—"} />
                <Detail label="Address" value={viewing.customerProfile?.address || "—"} className="sm:col-span-2" />
              </>
            ) : null}

            <Detail
              label="Joined"
              value={viewing.createdAt ? new Date(viewing.createdAt).toLocaleString() : "—"}
              className="sm:col-span-2"
            />
          </dl>

          {viewing.role === "driver" && (
            <DocumentsGrid title="Driver & truck documents">
              <DocumentCard
                label="Driver license"
                url={viewing.driverLicenseUrl}
                meta={viewing.driverLicense ? `No. ${viewing.driverLicense}` : undefined}
              />
              <DocumentCard label="Driver photo" url={viewing.driverImageUrl} />
              <DocumentCard label="Truck photo" url={viewing.truckPhotoUrl1} />
              {(viewing.truckDocumentUrls || []).length
                ? viewing.truckDocumentUrls.map((url, index) => (
                    <DocumentCard key={`${url}-${index}`} label={`Truck document ${index + 1}`} url={url} />
                  ))
                : <DocumentCard label="Truck documents" url={null} />}
            </DocumentsGrid>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>
            {canToggleStatus(viewing) ? (
              <Button
                variant={viewing.status === "Active" ? "secondary" : "primary"}
                onClick={async () => {
                  const ok = await onToggleStatus(viewing);
                  if (ok) setViewing(null);
                }}
              >
                {statusActionLabel(viewing)}
              </Button>
            ) : null}
            {(!viewing.isSuperAdmin || authUser.isSuperAdmin) ? (
              <Button onClick={() => { setViewing(null); openEdit(viewing); }}>Edit user</Button>
            ) : null}
          </div>
        </Modal>
      )}

      {open && (
        <Modal
          title={editing ? (isFleet ? "Edit driver" : isCustomersMode ? "Edit customer" : "Edit user") : (isFleet ? "Add Truck" : isCustomersMode ? "Add Customer" : "Create user")}
          onClose={() => setOpen(false)}
          wide
        >
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
            <input
              className="stitch-input"
              placeholder={selectedRole === "customer" ? "Full name (e.g. Cabdi Axmed Xaashi)" : "Full name"}
              maxLength={150}
              autoComplete="name"
              {...register("name", {
                required: true,
                minLength: 2,
                maxLength: 150,
                pattern: FULL_NAME_PATTERN
              })}
            />
            <input className="stitch-input" placeholder="Phone" {...register("phone", { required: selectedRole === "customer" })} />
            {!editing ? <input className="stitch-input sm:col-span-2" placeholder="Username" {...register("username", { required: true, minLength: 3 })} /> : null}
            <input className="stitch-input sm:col-span-2" type="email" placeholder={selectedRole === "customer" ? "Email (Gmail)" : "Email"} {...register("email", { required: true })} />
            {editing ? (
              <input
                className="stitch-input"
                type="password"
                placeholder="New password (optional)"
                {...register("password")}
              />
            ) : (
              <p className="sm:col-span-2 rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
                A temporary password will be emailed automatically. The user must set a new password on first sign-in.
              </p>
            )}
            {!isFleet && !isCustomersMode ? (
              <select className="stitch-input" {...register("role")}>
                <option value="customer">Customer</option>
                <option value="driver">Driver</option>
                {(authUser.isSuperAdmin || editing?.role === "admin") ? <option value="admin">Admin</option> : null}
              </select>
            ) : (
              <input type="hidden" {...register("role")} value={isCustomersMode ? "customer" : "driver"} />
            )}
            {!editing && selectedRole === "customer" && (
              <>
                <input className="stitch-input" placeholder="City" {...register("city", { required: true })} />
                <input className="stitch-input sm:col-span-2" placeholder="Address" {...register("address", { required: true })} />
              </>
            )}
            {editing && (editing.role === "customer" || isCustomersMode) ? (
              <>
                <input className="stitch-input" placeholder="City" {...register("city", { required: true })} />
                <input className="stitch-input sm:col-span-2" placeholder="Address" {...register("address", { required: true })} />
              </>
            ) : null}
            {(selectedRole === "driver" || (editing && editing.role === "driver") || isFleet) && (editing || selectedRole === "driver") ? (
              <>
                {!editing ? (
                  <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-outline-variant px-4 py-3 text-sm">
                      <input type="radio" name="serviceType" checked={serviceType === "FTL"} onChange={() => setServiceType("FTL")} />
                      FTL — full truck loads
                    </label>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-outline-variant px-4 py-3 text-sm">
                      <input type="radio" name="serviceType" checked={serviceType === "SHARED"} onChange={() => setServiceType("SHARED")} />
                      SHARED — partial capacity
                    </label>
                  </div>
                ) : null}
                <input className="stitch-input sm:col-span-2" placeholder="Driver license number" {...register("driverLicense", { required: true })} />
                {!editing ? (
                  <>
                    <FileField label="Driver license document *" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={setDriverLicenseDocument} />
                    <label className="sm:col-span-2 block text-sm">
                      <span className="mb-1.5 block font-medium text-on-surface-variant">Driver photo *</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="stitch-input w-full"
                        onChange={(e) => setDriverImage(e.target.files?.[0] || null)}
                        required
                      />
                    </label>
                  </>
                ) : null}
                <p className="sm:col-span-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
                  Truck ID is generated by the system automatically (e.g. TRK-…). You only enter plate number and truck details.
                </p>
                {editing?.truckNumber ? (
                  <div className="sm:col-span-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm">
                    <span className="text-xs font-semibold text-on-surface-variant">Truck ID</span>
                    <p className="font-semibold text-on-surface">{editing.truckNumber}</p>
                  </div>
                ) : null}
                <input className="stitch-input" placeholder="Plate number" {...register("plateNumber", { required: true })} />
                <input className="stitch-input" placeholder="Capacity" {...register("capacity", { required: true })} />
                <input className="stitch-input" placeholder="Write truck type" {...register("truckType", { required: true })} />                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-on-surface-variant">Region *</span>
                  <select
                    className="stitch-input"
                    {...register("region", {
                      required: true,
                      onChange: () => setValue("city", "")
                    })}
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
                {editing ? (
                  <label className="sm:col-span-2 block text-sm">
                    <span className="mb-1.5 block font-medium text-on-surface-variant">Truck status</span>
                    <select className="stitch-input" {...register("truckStatus")}>
                      <option value="Available">Available</option>
                      <option value="Busy">Busy</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Unavailable">Unavailable</option>
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="sm:col-span-2 block text-sm">
                      <span className="mb-1.5 block font-medium text-on-surface-variant">Truck photo *</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="stitch-input w-full"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          setTruckPhoto1(file || null);
                          setPhoto1Preview(file ? URL.createObjectURL(file) : "");
                        }}
                        required
                      />
                      {photo1Preview ? (
                        <img src={photo1Preview} alt="Truck preview" className="mt-2 h-24 w-full rounded-lg object-cover" />
                      ) : null}
                    </label>
                    <label className="sm:col-span-2 block text-sm">
                      <span className="mb-1.5 block font-medium text-on-surface-variant">Truck documents * (up to 5 images)</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="stitch-input w-full"
                        onChange={(e) => setTruckDocuments(Array.from(e.target.files || []).slice(0, 5))}
                        required
                      />
                    </label>
                  </>
                )}
              </>
            ) : null}
            {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={isSubmitting || mutations.create.isPending || mutations.update.isPending}>
                {editing ? "Save changes" : (isFleet ? "Register truck" : isCustomersMode ? "Register customer" : "Create")}
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

function FileField({ label, accept, onChange, required = true }) {
  return (
    <label className="block text-sm sm:col-span-2">
      <span className="mb-1.5 block font-medium text-on-surface-variant">{label}</span>
      <input type="file" accept={accept} className="stitch-input w-full" onChange={(event) => onChange(event.target.files?.[0] || null)} required={required} />
    </label>
  );
}
