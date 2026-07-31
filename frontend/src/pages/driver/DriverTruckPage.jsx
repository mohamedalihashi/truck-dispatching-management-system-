import { useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { DocumentCard, DocumentsGrid } from "../../components/ui/DocumentCard";
import { useAuth } from "../../contexts/AuthContext";
import { useTruckMutations, useTrucks } from "../../hooks/useApi";
import { resolveUploadUrl } from "../../config/api.js";
import { Truck } from "lucide-react";

export function DriverTruckPage() {
  const { user } = useAuth();
  const { data, isLoading } = useTrucks();
  const mutations = useTruckMutations();
  const [message, setMessage] = useState("");
  const truck = (data?.data || []).find((item) => item.driverId === user.id);
  const truckDocs = truck?.documentUrls || user.truckDocumentUrls || [];

  async function setStatus(status) {
    if (!truck) return;
    setMessage("");
    try {
      await mutations.update.mutateAsync({ id: truck.id, payload: { status } });
      setMessage(`Truck status set to ${status}`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Truck Profile" subtitle="View truck details, review documents, and update availability status." />
      {message && (
        <p className="rounded-xl border border-primary-fixed bg-primary-fixed/40 px-4 py-3 text-sm text-on-surface">
          {message}
        </p>
      )}
      {isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading truck…</p>
      ) : !truck ? (
        <p className="text-sm text-on-surface-variant">No truck linked to this driver.</p>
      ) : (
        <>
          <section className="max-w-3xl rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-secondary-container text-white">
              <Truck />
            </div>
            <h2 className="text-2xl font-bold text-on-surface">{truck.truckNumber}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Plate" value={truck.plateNumber} />
              <Row label="Type" value={truck.type || truck.truckType} />
              <Row label="Capacity" value={truck.capacity} />
              <Row label="Driver" value={truck.driver || user.name} />
              <Row label="License no." value={user.driverLicense || "—"} />
              <Row label="Status" value={<StatusBadge status={truck.status} />} />
            </dl>
            {(truck.photoUrl1 || truck.photoUrl2) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {truck.photoUrl1 ? (
                  <img src={resolveUploadUrl(truck.photoUrl1)} alt="Truck" className="h-36 w-full rounded-lg object-cover" />
                ) : null}
                {truck.photoUrl2 ? (
                  <img src={resolveUploadUrl(truck.photoUrl2)} alt="Truck 2" className="h-36 w-full rounded-lg object-cover" />
                ) : null}
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              {["Available", "Busy", "Maintenance"].map((status) => (
                <Button
                  key={status}
                  variant={truck.status === status ? "primary" : "secondary"}
                  className="px-3 py-1.5 text-xs"
                  onClick={() => setStatus(status)}
                  disabled={mutations.update.isPending}
                >
                  {status}
                </Button>
              ))}
            </div>
          </section>

          <DocumentsGrid title="License & truck documents">
            <DocumentCard
              label="Driver license"
              url={user.driverLicenseUrl}
              meta={user.driverLicense ? `No. ${user.driverLicense}` : undefined}
            />
            <DocumentCard label="Driver photo" url={user.driverImageUrl} />
            <DocumentCard label="Truck photo" url={truck.photoUrl1 || user.truckPhotoUrl1} />
            {truckDocs.length
              ? truckDocs.map((url, index) => (
                  <DocumentCard key={`${url}-${index}`} label={`Truck document ${index + 1}`} url={url} />
                ))
              : (
                  <DocumentCard label="Truck documents" url={null} />
                )}
          </DocumentsGrid>
        </>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="font-semibold text-on-surface">{value}</dd>
    </div>
  );
}
