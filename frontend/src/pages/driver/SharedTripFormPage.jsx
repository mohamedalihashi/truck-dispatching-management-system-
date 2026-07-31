import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useTrucks } from "../../hooks/useApi";
import { api } from "../../services/api";
import { somaliaLocations, somaliaRegions } from "../../data/somaliaLocations";
import { useLanguage } from "../../contexts/LanguageContext";

function truckCapacityTons(truck) {
  if (!truck) return null;
  const tons = Number(truck.capacityTons);
  if (Number.isFinite(tons) && tons > 0) return tons;
  const fromLabel = Number(String(truck.capacity || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(fromLabel) && fromLabel > 0 ? fromLabel : null;
}

export function SharedTripFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const isEdit = Boolean(id) && window.location.pathname.includes("/edit");

  const { data: trucksData, isLoading: trucksLoading } = useTrucks();
  const truck = (trucksData?.data || []).find((item) => item.driverId === user?.id);
  const capacityTons = truckCapacityTons(truck);

  const { data: existing } = useQuery({
    queryKey: ["shared-trip", id],
    queryFn: () => api.getSharedTrip(id),
    enabled: isEdit
  });

  const { register, handleSubmit, watch, setValue, reset, formState: { isSubmitting } } = useForm({
    defaultValues: {
      pickup: "",
      destination: "",
      fromRegion: "",
      fromDistrict: "",
      toRegion: "",
      toDistrict: "",
      departureDate: "",
      durationAmount: "",
      durationUnit: "hours",
      pricePerTon: "",
      notes: ""
    }
  });

  useEffect(() => {
    if (!existing) return;
    reset({
      pickup: existing.pickup || "",
      destination: existing.destination || "",
      fromRegion: existing.fromRegion || "",
      fromDistrict: existing.fromDistrict || "",
      toRegion: existing.toRegion || "",
      toDistrict: existing.toDistrict || "",
      departureDate: existing.departureDate ? String(existing.departureDate).slice(0, 10) : "",
      durationAmount: existing.durationAmount != null ? String(existing.durationAmount) : "",
      durationUnit: existing.durationUnit || "hours",
      pricePerTon: existing.pricePerTon != null ? String(existing.pricePerTon) : "",
      notes: existing.notes || ""
    });
  }, [existing, reset]);

  const fromDistricts = somaliaLocations[watch("fromRegion")] || [];
  const toDistricts = somaliaLocations[watch("toRegion")] || [];

  const save = useMutation({
    mutationFn: (payload) => (isEdit ? api.updateSharedTrip(id, payload) : api.createSharedTrip(payload)),
    onSuccess: (trip) => navigate(`/driver/shared-trips/${trip.id}`)
  });

  async function onSubmit(values) {
    if (!isEdit && !(capacityTons > 0)) {
      return;
    }
    await save.mutateAsync({
      pickup: values.pickup.trim(),
      destination: values.destination.trim(),
      fromRegion: values.fromRegion || undefined,
      fromDistrict: values.fromDistrict || undefined,
      toRegion: values.toRegion || undefined,
      toDistrict: values.toDistrict || undefined,
      departureDate: values.departureDate,
      durationAmount: Number(values.durationAmount),
      durationUnit: values.durationUnit,
      pricePerTon: Number(values.pricePerTon),
      notes: values.notes?.trim() || undefined
    });
  }

  const displayCapacity = isEdit
    ? (existing?.totalCapacityTons ?? capacityTons)
    : capacityTons;

  return (
    <div className="space-y-8">
      <PageHeader
        title={isEdit ? t("driver.formTitleEdit") : t("driver.formTitleNew")}
        subtitle={t("driver.formSubtitle")}
      />
      <form className="grid max-w-3xl gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Pickup label</span>
            <input className="stitch-input" {...register("pickup", { required: true })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Destination label</span>
            <input className="stitch-input" {...register("destination", { required: true })} />
          </label>
          <select className="stitch-input" {...register("fromRegion", { onChange: () => setValue("fromDistrict", "") })}>
            <option value="">From region</option>
            {somaliaRegions.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select className="stitch-input" disabled={!watch("fromRegion")} {...register("fromDistrict")}>
            <option value="">From district</option>
            {fromDistricts.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="stitch-input" {...register("toRegion", { onChange: () => setValue("toDistrict", "") })}>
            <option value="">To region</option>
            {somaliaRegions.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select className="stitch-input" disabled={!watch("toRegion")} {...register("toDistrict")}>
            <option value="">To district</option>
            {toDistricts.map((d) => <option key={d}>{d}</option>)}
          </select>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Departure date</span>
            <input className="stitch-input" type="date" required {...register("departureDate", { required: true })} />
          </label>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Duration</span>
              <input className="stitch-input" type="number" min="0.5" step="0.5" required {...register("durationAmount", { required: true })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Unit</span>
              <select className="stitch-input" {...register("durationUnit", { required: true })}>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </label>
          </div>
          <div className="block">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Total capacity (from your truck)</span>
            <div className="stitch-input flex items-center bg-surface-container-low text-on-surface">
              {trucksLoading ? "Loading…" : displayCapacity != null ? `${displayCapacity} tons` : "No truck capacity"}
            </div>
            {!trucksLoading && !(capacityTons > 0) && !isEdit && (
              <p className="mt-1 text-xs text-error">
                Update your{" "}
                <Link className="underline" to="/driver/truck">truck profile</Link>
                {" "}with capacity (tons) first.
              </p>
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Price per ton (lacagta)</span>
            <input className="stitch-input" type="number" min="0.01" step="0.01" required {...register("pricePerTon", { required: true })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Notes</span>
            <textarea className="stitch-input min-h-24" {...register("notes")} />
          </label>
        </div>
        {save.isError && (
          <p className="text-sm text-error">{save.error?.message || "Could not save trip"}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate("/driver/shared-trips")}>{t("common.cancel")}</Button>
          <Button
            type="submit"
            disabled={isSubmitting || save.isPending || (!isEdit && !(capacityTons > 0))}
          >
            {save.isPending ? t("common.loading") : isEdit ? t("common.save") : t("driver.formTitleNew")}
          </Button>
        </div>
      </form>
    </div>
  );
}
