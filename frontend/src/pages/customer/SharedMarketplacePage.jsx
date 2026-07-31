import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, MapPin, Package, Weight, X } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../services/api";
import { useLanguage } from "../../contexts/LanguageContext";
import { somaliaLocations, somaliaRegions } from "../../data/somaliaLocations";
import { money } from "../../utils/helpers";

export function SharedMarketplacePage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [booking, setBooking] = useState(null);
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [weightAmount, setWeightAmount] = useState("");
  const [weightUnit, setWeightUnit] = useState("tons");
  const [fromNeighborhood, setFromNeighborhood] = useState("");
  const [toNeighborhood, setToNeighborhood] = useState("");
  const [cargoPhoto, setCargoPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["public-shared-trips"],
    queryFn: () => api.listPublicSharedTrips({ limit: 50 })
  });

  const allTrips = data?.data || [];
  const districts = somaliaLocations[region] || [];

  const trips = useMemo(() => {
    let rows = allTrips;
    if (region) {
      const needle = region.toLowerCase();
      rows = rows.filter(
        (trip) =>
          trip.fromRegion?.toLowerCase() === needle ||
          trip.toRegion?.toLowerCase() === needle
      );
    }
    if (district) {
      const needle = district.toLowerCase();
      rows = rows.filter(
        (trip) =>
          trip.fromDistrict?.toLowerCase() === needle ||
          trip.toDistrict?.toLowerCase() === needle
      );
    }
    return rows;
  }, [allTrips, region, district]);

  function onRegionChange(value) {
    setRegion(value);
    setDistrict("");
  }

  useEffect(() => {
    const tripId = location.state?.sharedTripId;
    if (!tripId || !trips.length) return;
    const trip = trips.find((row) => row.id === tripId);
    if (trip) {
      setBooking(trip);
      navigate(".", { replace: true, state: {} });
    }
  }, [location.state?.sharedTripId, trips, navigate]);

  function openBooking(trip) {
    setBooking(trip);
    setWeightAmount("");
    setWeightUnit("tons");
    setFromNeighborhood("");
    setToNeighborhood("");
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setCargoPhoto(null);
    setPhotoPreview("");
    setError("");
  }

  function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setCargoPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setCargoPhoto(null);
    setPhotoPreview("");
  }

  async function submitBooking(e) {
    e.preventDefault();
    if (!booking) return;
    if (!fromNeighborhood.trim() || !toNeighborhood.trim()) {
      setError("Enter both pickup and delivery locations.");
      return;
    }
    const tons = weightUnit === "kg" ? Number(weightAmount) / 1000 : Number(weightAmount);
    if (!(tons > 0)) return setError("Enter a valid cargo weight.");
    if (tons > Number(booking.availableTons)) {
      return setError(`Only ${booking.availableTons} tons are available on this shared trip.`);
    }
    setError("");
    setLoading(true);
    try {
      const payload = {
        weightTons: tons,
        description: `Shared cargo weighing ${weightAmount} ${weightUnit}`,
        fromNeighborhood: fromNeighborhood.trim(),
        toNeighborhood: toNeighborhood.trim()
      };
      const request = await api.bookSharedTrip(booking.id, payload);
      if (cargoPhoto && request?.id) {
        try {
          const formData = new FormData();
          formData.append("cargoImage", cargoPhoto);
          await api.uploadCargoImage(request.id, formData);
        } catch {
          // Cargo photo is optional; keep the successfully created booking.
        }
      }
      navigate("/customer/payments", {
        state: {
          created: request.id,
          tripId: request.tripId,
          message: "Shared booking created. Pay the full fare once before pickup."
        }
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("customer.sharedBookPageTitle")}
        subtitle={t("customer.sharedBookPageSubtitle")}
        actions={
          <Button variant="secondary" onClick={() => navigate("/customer/find-trucks")}>
            {t("customer.ftlInstead")}
          </Button>
        }
      />

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Region</span>
            <select className="stitch-input w-full" value={region} onChange={(e) => onRegionChange(e.target.value)}>
              <option value="">All regions</option>
              {somaliaRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">District</span>
            <select
              className="stitch-input w-full"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              disabled={!region}
            >
              <option value="">{region ? "All districts" : "Select region first"}</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-on-surface-variant">Loading shared trips…</p>
      ) : !trips.length ? (
        <p className="rounded-xl border border-outline-variant bg-surface-container-lowest p-10 text-center text-sm text-on-surface-variant">
          {allTrips.length
            ? "No shared trips match this region or district. Try another filter."
            : "No shared capacity open right now. Check back later or book an FTL truck."}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {trips.map((trip) => (
            <article key={trip.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-on-surface">{trip.id}</p>
                  <p className="text-sm text-on-surface-variant">{trip.driver || "Driver"}</p>
                </div>
                <StatusBadge status={trip.status} />
              </div>
              <p className="mt-3 flex items-center gap-1 text-sm text-on-surface">
                <MapPin size={14} /> {trip.pickup} → {trip.destination}
              </p>
              <p className="mt-2 flex items-center gap-1 text-sm text-on-surface-variant">
                <Weight size={14} /> {trip.availableTons}t available of {trip.totalCapacityTons}t
              </p>
              {trip.pricePerTon != null ? (
                <p className="mt-1 text-sm text-on-surface-variant">{money(trip.pricePerTon)}/ton</p>
              ) : null}
              {trip.departureDate ? (
                <p className="mt-1 text-xs text-on-surface-variant">
                  Departs {new Date(trip.departureDate).toLocaleDateString()}
                  {trip.durationAmount != null && trip.durationUnit
                    ? ` · ${trip.durationAmount} ${trip.durationUnit}`
                    : ""}
                </p>
              ) : null}
              <Button className="mt-4 w-full" onClick={() => openBooking(trip)}>
                <Package size={14} /> {t("customer.bookCapacity")}
              </Button>
            </article>
          ))}
        </div>
      )}

      {booking && (
        <Modal title={`Book ${booking.id}`} onClose={() => setBooking(null)} wide>
          <p className="mb-4 text-sm text-on-surface-variant">
            {booking.pickup} → {booking.destination} · {booking.availableTons}t available
            {booking.pricePerTon != null ? ` · ${money(booking.pricePerTon)}/ton` : ""}
            {booking.durationAmount != null && booking.durationUnit
              ? ` · ${booking.durationAmount} ${booking.durationUnit}`
              : ""}
          </p>
          <form className="space-y-4" onSubmit={submitBooking}>
            <div className="grid gap-3 rounded-xl bg-surface-container p-4 sm:grid-cols-2">
              <RouteInfo
                label="Pickup route"
                region={booking.fromRegion}
                district={booking.fromDistrict}
                fallback={booking.pickup}
              />
              <RouteInfo
                label="Delivery route"
                region={booking.toRegion}
                district={booking.toDistrict}
                fallback={booking.destination}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Pickup location</span>
                <input className="stitch-input w-full" required placeholder="Enter pickup location" value={fromNeighborhood} onChange={(e) => setFromNeighborhood(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Delivery location</span>
                <input className="stitch-input w-full" required placeholder="Enter delivery location" value={toNeighborhood} onChange={(e) => setToNeighborhood(e.target.value)} />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Weight</span>
              <div className="grid grid-cols-[1fr_140px] gap-3">
                <input
                  className="stitch-input w-full"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={weightUnit === "kg" ? Number(booking.availableTons) * 1000 : booking.availableTons}
                  required
                  value={weightAmount}
                  onChange={(e) => setWeightAmount(e.target.value)}
                />
                <select className="stitch-input w-full" value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)}>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="tons">Tons</option>
                </select>
              </div>
            </label>

            <div className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Cargo image</span>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container p-5 text-center hover:border-primary">
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={selectPhoto} />
                {photoPreview ? (
                  <img src={photoPreview} alt="Cargo preview" className="max-h-44 rounded-lg object-cover" />
                ) : (
                  <>
                    <ImagePlus size={28} className="text-primary" />
                    <span className="mt-2 text-sm font-semibold">Select cargo image</span>
                    <span className="text-xs text-on-surface-variant">Optional</span>
                  </>
                )}
              </label>
              {photoPreview && (
                <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-error" onClick={removePhoto}>
                  <X size={14} /> Remove image
                </button>
              )}
            </div>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setBooking(null)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? "Booking…" : "Book with driver"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function RouteInfo({ label, region, district, fallback }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-1 text-sm font-semibold text-on-surface">
        {[district, region].filter(Boolean).join(", ") || fallback || "Route information unavailable"}
      </p>
    </div>
  );
}
