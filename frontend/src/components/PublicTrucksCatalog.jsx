import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Eye, MapPin, Package, SlidersHorizontal, Truck, Weight, X } from "lucide-react";
import { StatusBadge } from "./ui/StatusBadge";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { api } from "../services/api";
import { resolveUploadUrl } from "../config/api.js";
import { somaliaLocations, somaliaRegions } from "../data/somaliaLocations";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { money } from "../utils/helpers";

const SERVICE_FILTERS = [
  { value: "", label: "All listings" },
  { value: "ftl", label: "FTL — full truck" },
  { value: "shared", label: "Shared load" }
];

export function PublicTrucksCatalog({ limit = 48, showViewAll = false, compact = false, defaultServiceFilter = "" }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const ftlOnly = defaultServiceFilter === "ftl";
  const [serviceFilter, setServiceFilter] = useState(defaultServiceFilter);
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [truckType, setTruckType] = useState("");
  const [viewingFtl, setViewingFtl] = useState(null);
  const [viewingShared, setViewingShared] = useState(null);

  const districts = somaliaLocations[region] || [];

  const trucksQuery = useQuery({
    queryKey: ["public-trucks", region, district, limit],
    queryFn: () =>
      api.listPublicTrucks({
        region: region || undefined,
        city: district || undefined,
        limit
      }),
    enabled: serviceFilter !== "shared"
  });

  const sharedQuery = useQuery({
    queryKey: ["public-shared-trips", limit],
    queryFn: () => api.listPublicSharedTrips({ limit }),
    enabled: !ftlOnly && serviceFilter !== "ftl"
  });

  const trucks = useMemo(() => {
    if (serviceFilter === "shared") return [];
    let rows = trucksQuery.data?.data || [];
    if (truckType) {
      const needle = truckType.toLowerCase();
      rows = rows.filter((row) => (row.truckType || row.type || "").toLowerCase() === needle);
    }
    return rows;
  }, [trucksQuery.data?.data, serviceFilter, truckType]);

  const sharedTrips = useMemo(() => {
    if (ftlOnly || serviceFilter === "ftl") return [];
    let rows = sharedQuery.data?.data || [];
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
    if (truckType) {
      const needle = truckType.toLowerCase();
      rows = rows.filter((trip) => trip.truckType?.toLowerCase() === needle);
    }
    return rows;
  }, [sharedQuery.data?.data, ftlOnly, serviceFilter, region, district, truckType]);

  const isLoading =
    (serviceFilter !== "shared" && trucksQuery.isLoading) ||
    (!ftlOnly && serviceFilter !== "ftl" && sharedQuery.isLoading);

  const totalCount = trucks.length + sharedTrips.length;
  const hasActiveFilters = Boolean(region || district || truckType);

  const truckTypeOptions = useMemo(() => {
    const types = new Set();
    (trucksQuery.data?.data || []).forEach((row) => {
      if (row.truckType) types.add(row.truckType);
      else if (row.type) types.add(row.type);
    });
    (sharedQuery.data?.data || []).forEach((row) => {
      if (row.truckType) types.add(row.truckType);
    });
    return [...types].sort((a, b) => a.localeCompare(b));
  }, [trucksQuery.data?.data, sharedQuery.data?.data]);

  function onRegionChange(value) {
    setRegion(value);
    setDistrict("");
  }

  function clearFilters() {
    setRegion("");
    setDistrict("");
    setTruckType("");
  }

  function bookTruck(truck) {
    const bookState = {
      truckType: truck.truckType || truck.type || "",
      fromRegion: truck.region || "",
      preferredTruckId: truck.id,
      truckLabel: `${truck.truckNumber || "Truck"} · ${truck.truckType || truck.type || "General"}`
    };
    if (isAuthenticated) {
      navigate("/customer/book", { state: bookState });
      return;
    }
    navigate("/login", { state: { from: "/customer/book", bookState } });
  }

  function bookShared(trip) {
    const target = "/customer/shared-marketplace";
    const state = { sharedTripId: trip.id };
    if (isAuthenticated) {
      navigate(target, { state });
      return;
    }
    navigate("/login", { state: { from: target, bookState: state } });
  }

  return (
    <div className="space-y-6">
      {compact ? (
        <div className="flex flex-wrap justify-center gap-2">
          {SERVICE_FILTERS.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              onClick={() => setServiceFilter(option.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                serviceFilter === option.value
                  ? "bg-secondary-container text-on-secondary"
                  : "border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {option.value === "" ? t("All") : option.value === "ftl" ? "FTL" : t("Shared")}
            </button>
          ))}
        </div>
      ) : (
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <SlidersHorizontal size={16} className="text-secondary-container" />
              {t("Filter")}
            </div>
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <span>
                {isLoading
                  ? t("Loading…")
                  : `${totalCount} ${t(totalCount === 1 ? "result" : "results")}`}
              </span>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-secondary-container hover:bg-secondary-container/10"
                >
                  <X size={14} />
                  {t("Clear")}
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FilterField label={t("Region")}>
              <select className="stitch-input w-full" value={region} onChange={(e) => onRegionChange(e.target.value)}>
                <option value="">{t("All regions")}</option>
                {somaliaRegions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label={t("District")}>
              <select
                className="stitch-input w-full"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                disabled={!region}
              >
                <option value="">{region ? t("All districts") : t("Select region first")}</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label={t("Type")}>
              <select
                className="stitch-input w-full"
                value={truckType}
                onChange={(e) => setTruckType(e.target.value)}
              >
                <option value="">{t("All types")}</option>
                {truckTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </FilterField>
          </div>
        </section>
      )}

      {isLoading ? (
        <p className="py-16 text-center text-sm text-on-surface-variant">{t("Loading listings…")}</p>
      ) : !totalCount ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-10 text-center">
          <Truck className="mx-auto text-on-surface-variant" size={40} />
          <p className="mt-3 font-semibold text-on-surface">{t("No matching listings")}</p>
          <p className="mt-2 text-sm text-on-surface-variant">
            {ftlOnly
              ? "No FTL trucks match this region, district, or type. Try another filter."
              : "FTL trucks and shared loads appear here when drivers register or post trips. Try another filter."}
          </p>
        </div>
      ) : (
        <div className={`grid gap-4 ${compact ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
          {trucks.map((truck) => (
            <article
              key={`ftl-${truck.id}`}
              className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]"
            >
              <div className="relative aspect-[16/10] bg-surface-container">
                {truck.photoUrl1 ? (
                  <img src={resolveUploadUrl(truck.photoUrl1)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-on-surface-variant">
                    <Truck size={40} />
                  </div>
                )}
                <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  FTL
                </span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-on-surface">{truck.truckNumber || "Truck"}</p>
                    <p className="text-sm text-on-surface-variant">{truck.truckType || truck.type}</p>
                  </div>
                  <StatusBadge status={truck.bookable ? truck.status : "Pending Verification"} />
                </div>
                <p className="mt-2 flex items-center gap-1 text-sm text-on-surface-variant">
                  <MapPin size={14} /> {[truck.city, truck.region].filter(Boolean).join(", ") || "Somalia"}
                </p>
                <p className="mt-1 flex items-center gap-1 text-sm text-on-surface-variant">
                  <Weight size={14} /> {truck.capacity}
                  {truck.capacityTons != null ? ` (${truck.capacityTons}t)` : ""}
                </p>
                  {truck.driver ? (
                  <p className="mt-1 text-xs text-on-surface-variant">{t("Driver")}: {truck.driver}</p>
                ) : null}
                <div className="mt-auto flex flex-col gap-2 pt-3">
                  <Button variant="secondary" className="w-full" onClick={() => setViewingFtl(truck)}>
                    <Eye size={14} /> View info
                  </Button>
                  {truck.bookable ? (
                    <Button className="w-full" onClick={() => bookTruck(truck)}>
                      Book truck <ArrowRight size={14} />
                    </Button>
                  ) : (
                    <p className="rounded-lg bg-surface-container px-3 py-2.5 text-center text-sm text-on-surface-variant">
                      {t("Awaiting verification")}
                    </p>
                  )}
                </div>
              </div>
            </article>
          ))}

          {sharedTrips.map((trip) => (
            <article
              key={`shared-${trip.id}`}
              className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-on-surface">{trip.pickup} → {trip.destination}</p>
                  <p className="text-sm text-on-surface-variant">{trip.driver || "Driver"} · {trip.truck || "Truck"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-tertiary-fixed px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-on-tertiary-fixed">
                  {t("Shared")}
                </span>
              </div>
              <p className="mt-3 flex items-center gap-1 text-sm text-on-surface-variant">
                <MapPin size={14} />
                {[trip.fromDistrict, trip.fromRegion].filter(Boolean).join(", ") || trip.pickup}
                {" → "}
                {[trip.toDistrict, trip.toRegion].filter(Boolean).join(", ") || trip.destination}
              </p>
              <p className="mt-2 flex items-center gap-1 text-sm text-on-surface-variant">
                <Weight size={14} /> {trip.availableTons}t available of {trip.totalCapacityTons}t
              </p>
              {trip.pricePerTon != null ? (
                <p className="mt-1 text-sm text-on-surface">From {money(trip.pricePerTon)}/ton</p>
              ) : null}
              {trip.departureDate ? (
                <p className="mt-1 text-xs text-on-surface-variant">
                  {t("Departs")} {new Date(trip.departureDate).toLocaleDateString()}
                  {trip.durationAmount != null && trip.durationUnit
                    ? ` · ${trip.durationAmount} ${trip.durationUnit}`
                    : ""}
                </p>
              ) : null}
              <div className="mt-auto flex flex-col gap-2 pt-4">
                <Button variant="secondary" className="w-full" onClick={() => setViewingShared(trip)}>
                  <Eye size={14} /> View info
                </Button>
                <Button className="w-full" onClick={() => bookShared(trip)}>
                  <Package size={14} /> Book capacity
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showViewAll ? (
        <div className="text-center">
          <Link to="/trucks" className="text-sm font-semibold text-secondary-container hover:underline">
            {t("View all trucks & loads")}
          </Link>
        </div>
      ) : null}

      {viewingFtl ? (
        <Modal title={viewingFtl.truckNumber || "FTL truck"} onClose={() => setViewingFtl(null)} wide>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              {viewingFtl.photoUrl1 ? (
                <img src={resolveUploadUrl(viewingFtl.photoUrl1)} alt="" className="aspect-[16/10] w-full rounded-xl object-cover" />
              ) : (
                <div className="flex aspect-[16/10] items-center justify-center rounded-xl bg-surface-container text-on-surface-variant">
                  <Truck size={48} />
                </div>
              )}
              {viewingFtl.photoUrl2 ? (
                <img src={resolveUploadUrl(viewingFtl.photoUrl2)} alt="" className="aspect-[16/10] w-full rounded-xl object-cover" />
              ) : null}
            </div>
            <dl className="space-y-3 text-sm">
              <Detail label="Service" value="FTL — full truck" />
              <Detail label="Truck number" value={viewingFtl.truckNumber || "—"} />
              <Detail label="Plate number" value={viewingFtl.plateNumber || "—"} />
              <Detail label="Type" value={viewingFtl.truckType || viewingFtl.type || "—"} />
              <Detail label="Capacity" value={viewingFtl.capacity || "—"} />
              <Detail label="Location" value={[viewingFtl.city, viewingFtl.region].filter(Boolean).join(", ") || "Somalia"} />
              <Detail label="Driver" value={viewingFtl.driverName || viewingFtl.driver || "—"} />
              <Detail label="Status" value={<StatusBadge status={viewingFtl.bookable ? viewingFtl.status : "Pending Verification"} />} />
            </dl>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setViewingFtl(null)}>Close</Button>
            {viewingFtl.bookable ? (
              <Button onClick={() => { setViewingFtl(null); bookTruck(viewingFtl); }}>
                Book truck <ArrowRight size={14} />
              </Button>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {viewingShared ? (
        <Modal title="Shared load" onClose={() => setViewingShared(null)} wide>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Service" value="Shared load — partial capacity" />
            <Detail label="Route" value={`${viewingShared.pickup} → ${viewingShared.destination}`} />
            <Detail label="Driver" value={viewingShared.driver || "—"} />
            <Detail label="Truck" value={viewingShared.truck || "—"} />
            <Detail label="Truck type" value={viewingShared.truckType || "—"} />
            <Detail label="Available capacity" value={`${viewingShared.availableTons}t of ${viewingShared.totalCapacityTons}t`} />
            <Detail label="Price per ton" value={viewingShared.pricePerTon != null ? money(viewingShared.pricePerTon) : "—"} />
            <Detail
              label="Departure"
              value={viewingShared.departureDate ? new Date(viewingShared.departureDate).toLocaleString() : "Flexible"}
            />
            <Detail label="Status" value={<StatusBadge status={viewingShared.status} />} />
            {viewingShared.notes ? (
              <div className="sm:col-span-2">
                <Detail label="Notes" value={viewingShared.notes} />
              </div>
            ) : null}
          </dl>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setViewingShared(null)}>Close</Button>
            <Button onClick={() => { setViewingShared(null); bookShared(viewingShared); }}>
              Book capacity <ArrowRight size={14} />
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function FilterField({ label, className = "", children }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 font-medium text-on-surface">{value}</dd>
    </div>
  );
}
