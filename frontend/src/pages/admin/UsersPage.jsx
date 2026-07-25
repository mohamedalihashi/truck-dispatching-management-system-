import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, Pencil, Plus, Trash2, Truck, UserCog, Users } from "lucide-react";
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

/** mode="fleet" → Fleet / Drivers. mode="customers" → Customers (dispatcher register). */
export function UsersPage({ mode } = {}) {
  const { user: authUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isDispatcher = authUser.role === "dispatcher";
  const isCustomersMode = mode === "customers";
  const isFleet = mode === "fleet" || (isDispatcher && !isCustomersMode);
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
  const [nationalIdBack, setNationalIdBack] = useState(null);
  const [dispatcherPhoto, setDispatcherPhoto] = useState(null);
  const [dispatcherCv, setDispatcherCv] = useState(null);
  const [photo1Preview, setPhoto1Preview] = useState("");
  const listRole = isFleet ? "driver" : isCustomersMode ? "customer" : role || undefined;
  const { data, isLoading } = useUsers({ role: listRole, search: search || undefined });
  const { data: summary } = useUserSummary();
  const mutations = useUserMutations();
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
    setNationalIdBack(null);
    setDispatcherPhoto(null);
    setDispatcherCv(null);
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
    reset({
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      role: user.role
    });
    setOpen(true);
  }

  async function onSubmit(values) {
    setError("");
    try {
      if (editing) {
        if (isDispatcher) {
          setError("Dispatchers cannot edit accounts. Contact an admin.");
          return;
        }
        const payload = {
          name: values.name,
          email: values.email,
          phone: values.phone || undefined,
          role: values.role
        };
        if (values.password) payload.password = values.password;
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
          formData.append("truckNumber", values.truckNumber);
          formData.append("plateNumber", values.plateNumber);
          formData.append("capacity", values.capacity);
          formData.append("truckType", values.truckType);
          formData.append("city", values.city?.trim() || "");
          formData.append("region", values.region?.trim() || "");
          formData.append("truckPhoto1", truckPhoto1);
          formData.append("driverImage", driverImage);
          formData.append("driverLicenseDocument", driverLicenseDocument);
          truckDocuments.forEach((file) => formData.append("truckDocuments", file));
          result = await mutations.create.mutateAsync(formData);
        } else if (createRole === "dispatcher") {
          if (!nationalIdBack || !dispatcherPhoto || !dispatcherCv) {
            setError("National ID back, profile photo, and CV are required.");
            return;
          }
          const formData = new FormData();
          [
            "name",
            "username",
            "email",
            "phone",
            "dispatcherCode",
            "nationalIdNumber",
            "dateOfBirth",
            "gender",
            "city",
            "address",
            "yearsOfExperience",
            "emergencyContactName",
            "emergencyContactPhone"
          ].forEach((key) => {
            if (values[key] !== undefined && values[key] !== "") formData.append(key, values[key]);
          });
          formData.append("role", "dispatcher");
          formData.append("nationalIdBack", nationalIdBack);
          formData.append("dispatcherPhoto", dispatcherPhoto);
          formData.append("dispatcherCv", dispatcherCv);
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
        const parts = [result.message || "User created. Credentials sent by email."];
        if (result.devPassword) parts.push(`Temp password: ${result.devPassword}`);
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

  async function onDelete(user) {
    if (isDispatcher) return;
    if (user.role === "admin") {
      alert("Admin users cannot be deleted.");
      return;
    }
    if (!confirm("Delete this user?")) return;
    try {
      await mutations.remove.mutateAsync(user.id);
    } catch (err) {
      alert(err.message);
    }
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
              : "Manage admins, dispatchers, customers, and driver-truck accounts."
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

      <section className={`grid grid-cols-2 gap-3 ${isFleet || isCustomersMode ? "md:grid-cols-2" : "md:grid-cols-3 xl:grid-cols-4"}`}>
        {isFleet ? (
          <>
            <MetricCard icon={Users} label="Total Drivers" value={summary?.drivers ?? "—"} tone="navy" />
            <MetricCard icon={Truck} label="Fleet Trucks" value={summary?.trucks ?? "—"} tone="soft" />
          </>
        ) : isCustomersMode ? (
          <>
            <MetricCard icon={Users} label="Total Customers" value={summary?.customers ?? "—"} tone="blue" />
          </>
        ) : (
          <>
            <MetricCard icon={Users} label="Total Users" value={summary?.total ?? "—"} tone="navy" />
            <MetricCard icon={Users} label="Total Customers" value={summary?.customers ?? "—"} tone="blue" />
            <MetricCard icon={UserCog} label="Total Dispatchers" value={summary?.dispatchers ?? "—"} tone="amber" />
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
            <option value="dispatcher">Dispatcher</option>
            <option value="customer">Customer</option>
            <option value="driver">Driver</option>
          </select>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-on-surface">
            {isFleet ? "Drivers & trucks" : isCustomersMode ? "Customer directory" : "Directory"}
          </h2>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">
            {isFleet ? "Loading fleet…" : isCustomersMode ? "Loading customers…" : "Loading users…"}
          </p>
        ) : (
          <DataTable
            rows={data?.data || []}
            columns={[
              { key: "name", label: "Name" },
              { key: "email", label: "Email" },
              ...(!isFleet && !isCustomersMode ? [{
                key: "role",
                label: "Role",
                render: (row) => row.isSuperAdmin ? "Super Admin" : row.role
              }] : isCustomersMode ? [
                {
                  key: "city",
                  label: "City",
                  render: (row) => row.customerProfile?.city || "—"
                },
                {
                  key: "address",
                  label: "Address",
                  render: (row) => row.customerProfile?.address || "—"
                }
              ] : [
                { key: "truckNumber", label: "Truck", render: (row) => row.truckNumber || "—" },
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
                key: "actions",
                label: "",
                render: (row) => (
                  <div className="flex gap-2">
                    <button type="button" className="text-on-surface-variant" onClick={() => setViewing(row)} title="View">
                      <Eye size={16} />
                    </button>
                    {!isDispatcher ? (
                      <>
                        {(!row.isSuperAdmin || authUser.isSuperAdmin) && (
                          <button type="button" className="text-secondary-container" onClick={() => openEdit(row)} title="Edit">
                            <Pencil size={16} />
                          </button>
                        )}
                        {row.role !== "admin" && (
                          <button type="button" className="text-error" onClick={() => onDelete(row)} title="Delete">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </>
                    ) : isFleet && row.status !== "Active" ? (
                      <Button className="px-2 py-1 text-xs" onClick={() => mutations.verifyDriver.mutate(row.id)}>Verify</Button>
                    ) : null}
                  </div>
                )
              }
            ]}
          />
        )}
      </section>

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)} wide>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <Detail label="Email" value={viewing.email} />
            <Detail label="Phone" value={viewing.phone || "—"} />
            <Detail label="Role" value={viewing.isSuperAdmin ? "Super Admin" : viewing.role} />
            {viewing.role === "driver" ? (
              <>
                <Detail label="Truck number" value={viewing.truckNumber || "—"} />
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
            {viewing.role === "dispatcher" && viewing.dispatcherProfile ? (
              <>
                <Detail label="Dispatcher code" value={viewing.dispatcherProfile.dispatcherCode || "—"} />
                <Detail label="National ID" value={viewing.dispatcherProfile.nationalIdNumber || "—"} />
                <Detail label="City" value={viewing.dispatcherProfile.city || "—"} />
                <Detail label="Address" value={viewing.dispatcherProfile.address || "—"} />
                <Detail label="Experience" value={viewing.dispatcherProfile.yearsOfExperience ?? "—"} />
                <Detail label="Verification" value={viewing.dispatcherProfile.verificationStatus || "—"} />
              </>
            ) : null}
            {viewing.role === "customer" && viewing.customerProfile ? (
              <>
                <Detail label="City" value={viewing.customerProfile.city || "—"} />
                <Detail label="Address" value={viewing.customerProfile.address || "—"} className="sm:col-span-2" />
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

          {viewing.role === "dispatcher" && (
            <DocumentsGrid title="Dispatcher documents">
              <DocumentCard
                label="National ID front"
                url={viewing.dispatcherProfile?.nationalIdFrontUrl}
                meta={viewing.dispatcherProfile?.nationalIdNumber ? `ID ${viewing.dispatcherProfile.nationalIdNumber}` : undefined}
              />
              <DocumentCard label="National ID back" url={viewing.dispatcherProfile?.nationalIdBackUrl} />
              <DocumentCard label="Profile photo" url={viewing.dispatcherProfile?.profilePhotoUrl || viewing.avatarUrl} />
              <DocumentCard label="CV" url={viewing.dispatcherProfile?.cvUrl} />
            </DocumentsGrid>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>
            {!isDispatcher && (!viewing.isSuperAdmin || authUser.isSuperAdmin) ? (
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
            <input className="stitch-input" placeholder={selectedRole === "customer" ? "Full name" : "Name"} {...register("name", { required: true })} />
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
                <option value="dispatcher">Dispatcher</option>
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
            {!editing && selectedRole === "driver" && (
              <>
                <input className="stitch-input sm:col-span-2" placeholder="Driver license number" {...register("driverLicense", { required: true })} />
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
                <input className="stitch-input" placeholder="Truck number" {...register("truckNumber", { required: true })} />
                <input className="stitch-input" placeholder="Plate number" {...register("plateNumber", { required: true })} />
                <input className="stitch-input" placeholder="Capacity" {...register("capacity", { required: true })} />
                <input className="stitch-input" placeholder="Write truck type" {...register("truckType", { required: true })} />
                <label className="block text-sm">
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
            {!editing && selectedRole === "dispatcher" && (
              <>
                <input className="stitch-input" placeholder="Dispatcher code" {...register("dispatcherCode", { required: true })} />
                <input className="stitch-input" placeholder="National ID number" {...register("nationalIdNumber", { required: true })} />
                <input className="stitch-input" type="date" {...register("dateOfBirth", { required: true })} />
                <select className="stitch-input" {...register("gender", { required: true })}><option value="">Gender</option><option>Male</option><option>Female</option><option>Other</option></select>
                <input className="stitch-input" placeholder="City" {...register("city", { required: true })} />
                <input className="stitch-input" placeholder="Address" {...register("address", { required: true })} />
                <input className="stitch-input" type="number" min="0" placeholder="Years of experience" {...register("yearsOfExperience", { required: true })} />
                <input className="stitch-input" placeholder="Emergency contact name" {...register("emergencyContactName", { required: true })} />
                <input className="stitch-input" placeholder="Emergency contact phone" {...register("emergencyContactPhone", { required: true })} />
                <FileField label="National ID back *" accept="image/jpeg,image/png,image/webp" onChange={setNationalIdBack} />
                <FileField label="Profile photo *" accept="image/jpeg,image/png,image/webp" onChange={setDispatcherPhoto} />
                <FileField label="CV *" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={setDispatcherCv} />
              </>
            )}
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
