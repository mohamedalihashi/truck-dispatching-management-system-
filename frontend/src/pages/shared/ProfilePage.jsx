import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, FileText, Mail, Phone, Shield, Truck, User } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { DocumentCard, DocumentsGrid } from "../../components/ui/DocumentCard";
import { useAuth } from "../../contexts/AuthContext";
import { useProfileUpdate, useTrucks } from "../../hooks/useApi";
import { api } from "../../services/api";
import { resolveUploadUrl } from "../../config/api.js";
import { roleHome } from "../../utils/helpers";

const roleLabels = {
  admin: "Admin",
  dispatcher: "Dispatcher",
  customer: "Customer",
  driver: "Driver"
};

function roleLabel(role) {
  return roleLabels[role] || String(role || "User").replace(/_/g, " ");
}

function driverServiceLabel(serviceType) {
  if (serviceType === "FTL") return "FTL (Full Truck)";
  if (serviceType === "SHARED") return "Shared Load";
  return "Not selected";
}

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { data: trucks } = useTrucks();
  const updateProfile = useProfileUpdate();
  const avatarInputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const base = roleHome(user.role);
  const truck =
    user.role === "driver"
      ? (trucks?.data || []).find((item) => item.driverId === user.id)
      : null;
  const avatarSrc = user.avatarUrl ? resolveUploadUrl(user.avatarUrl) : null;
  const truckDocs = truck?.documentUrls?.length
    ? truck.documentUrls
    : user.truckDocumentUrls || [];

  function openEdit() {
    setForm({ name: user.name || "", phone: user.phone || "", password: "" });
    setError("");
    setOpen(true);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = { name: form.name, phone: form.phone };
      if (form.password) payload.password = form.password;
      await updateProfile.mutateAsync(payload);
      await refreshUser();
      setMessage("Profile updated.");
      setOpen(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const result = await api.uploadAvatar(formData);
      await refreshUser();
      setMessage(result.message || "Profile photo updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Profile"
        subtitle="Your marketplace account, role details, and uploaded documents."
        actions={
          <Button variant="secondary" onClick={openEdit}>
            Edit profile
          </Button>
        }
      />

      {message && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </p>
      )}
      {error && !open && (
        <p className="rounded-xl border border-error-container bg-error-container/30 px-4 py-3 text-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-outline-variant bg-sidebar p-6 text-on-sidebar shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-4">
          <div className="relative mb-6 inline-block">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={user.name}
                className="h-20 w-20 rounded-full border-4 border-secondary-container object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-secondary-container bg-white/10 text-3xl font-bold text-white">
                {user.name?.charAt(0) || "U"}
              </div>
            )}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-secondary-container text-white shadow-md hover:opacity-90 disabled:opacity-60"
              title="Change profile photo"
            >
              <Camera size={14} />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onAvatarChange}
            />
          </div>
          <p className="text-xs text-white/70">
            {uploadingAvatar ? "Uploading photo…" : "Tap camera icon to change your photo"}
          </p>
          <h2 className="mt-4 text-2xl font-bold text-white">{user.name}</h2>
          <p className="mt-2 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-semibold text-white">
            Role: {roleLabel(user.role)}
          </p>
          {user.role === "driver" && (
            <p className="ml-2 mt-2 inline-flex rounded-full border border-secondary-container/60 bg-secondary-container/20 px-3 py-1 text-sm font-semibold text-white">
              Service: {driverServiceLabel(user.serviceType)}
            </p>
          )}
          <div className="mt-6 space-y-3 text-sm text-white/80">
            <p className="flex items-center gap-2">
              <Mail size={16} className="text-secondary-container" /> {user.email}
            </p>
            {user.phone && (
              <p className="flex items-center gap-2">
                <Phone size={16} className="text-secondary-container" /> {user.phone}
              </p>
            )}
            <p className="flex items-center gap-2">
              <Shield size={16} className="text-secondary-container" /> {user.status || "Active"}
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-8">
          <h3 className="mb-4 text-xl font-semibold text-on-surface">Account Details</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label="Full name" value={user.name} icon={User} />
            <Info label="Email" value={user.email} icon={Mail} />
            <Info label="Role" value={roleLabel(user.role)} icon={Shield} />
            <Info label="Phone" value={user.phone || "—"} icon={Phone} />
            {user.role === "driver" && (
              <>
                <Info label="Driver service type" value={driverServiceLabel(user.serviceType)} icon={Truck} />
                <Info label="License number" value={user.driverLicense || "—"} icon={FileText} />
                <Info label="National ID" value={user.nationalIdNumber || "—"} icon={FileText} />
              </>
            )}
          </dl>

          {truck && (
            <div className="mt-8 rounded-xl border border-outline-variant bg-surface-container-low p-5">
              <div className="mb-3 flex items-center gap-2 text-lg font-semibold text-on-surface">
                <Truck size={20} className="text-secondary-container" />
                Linked Truck
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label="Truck number" value={truck.truckNumber} />
                <Info label="Plate" value={truck.plateNumber} />
                <Info label="Region" value={truck.region || "—"} />
                <Info label="City" value={truck.city || "—"} />
                <Info label="Type" value={truck.type || truck.truckType} />
                <Info label="Status" value={<StatusBadge status={truck.status} />} />
              </dl>
              {(truck.photoUrl1 || truck.photoUrl2) && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {truck.photoUrl1 ? (
                    <img
                      src={resolveUploadUrl(truck.photoUrl1)}
                      alt="Truck photo 1"
                      className="h-32 w-full rounded-lg object-cover"
                    />
                  ) : null}
                  {truck.photoUrl2 ? (
                    <img
                      src={resolveUploadUrl(truck.photoUrl2)}
                      alt="Truck photo 2"
                      className="h-32 w-full rounded-lg object-cover"
                    />
                  ) : null}
                </div>
              )}
              {user.role === "driver" && (
                <Link
                  to={`${base}/truck`}
                  className="mt-4 inline-block text-sm font-semibold text-secondary-container hover:underline"
                >
                  Open truck details
                </Link>
              )}
            </div>
          )}

          {user.role === "driver" && (
            <DocumentsGrid title="Driver & truck documents">
              <DocumentCard
                label="Driver license"
                url={user.driverLicenseUrl}
                meta={user.driverLicense ? `No. ${user.driverLicense}` : undefined}
              />
              <DocumentCard label="Driver photo" url={user.driverImageUrl} />
              {(truck?.photoUrl1 || user.truckPhotoUrl1) && (
                <DocumentCard label="Truck photo" url={truck?.photoUrl1 || user.truckPhotoUrl1} />
              )}
              {truckDocs.length
                ? truckDocs.map((url, index) => (
                    <DocumentCard key={`${url}-${index}`} label={`Truck document ${index + 1}`} url={url} />
                  ))
                : (
                    <DocumentCard label="Truck documents" url={null} />
                  )}
            </DocumentsGrid>
          )}
        </section>
      </div>

      {open && (
        <Modal title="Edit profile" onClose={() => setOpen(false)}>
          <form className="space-y-3" onSubmit={saveProfile}>
            <input
              className="stitch-input w-full"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <input
              className="stitch-input w-full"
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <input
              className="stitch-input w-full"
              type="password"
              placeholder="New password (optional)"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Info({ label, value, icon: Icon }) {
  return (
    <div className="rounded-lg border border-outline-variant/50 bg-surface-container-low/40 px-4 py-3">
      <dt className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-on-surface-variant">
        {Icon && <Icon size={14} className="text-secondary-container" />}
        {label}
      </dt>
      <dd className="text-sm font-semibold text-on-surface">{value}</dd>
    </div>
  );
}
