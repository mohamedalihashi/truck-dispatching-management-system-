import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { ImagePlus, Package, Truck, X } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { useCreateCargo } from "../../hooks/useApi";
import { api } from "../../services/api";
import {
  formatSomaliaLocation,
  somaliaLocations,
  somaliaRegions
} from "../../data/somaliaLocations";

export function BookTruckPage() {
  const create = useCreateCargo();
  const navigate = useNavigate();
  const location = useLocation();
  const submissionKey = useRef(crypto.randomUUID());
  const selectionProcessed = useRef(false);
  const [preferredTruckId, setPreferredTruckId] = useState("");
  const [truckLabel, setTruckLabel] = useState("");
  const [cargoPhotos, setCargoPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm({
    defaultValues: {
      fromRegion: "",
      fromDistrict: "",
      fromLocation: "",
      toRegion: "",
      toDistrict: "",
      toLocation: "",
      truckType: "",
      weightAmount: "",
      weightUnit: "tons"
    }
  });
  const values = watch();
  const fromDistricts = somaliaLocations[values.fromRegion] || [];
  const toDistricts = somaliaLocations[values.toRegion] || [];

  useEffect(() => {
    if (selectionProcessed.current) return;
    selectionProcessed.current = true;
    const selectedTruck = location.state;
    if (!selectedTruck?.preferredTruckId) {
      navigate("/customer/find-trucks", { replace: true });
      return;
    }
    setPreferredTruckId(selectedTruck.preferredTruckId);
    setTruckLabel(selectedTruck.truckLabel || selectedTruck.truckType || "Selected truck");
    setValue("truckType", selectedTruck.truckType || "General");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, setValue]);

  function selectPhotos(event) {
    const files = [...(event.target.files || [])].slice(0, 1);
    photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    setCargoPhotos(files);
    setPhotoPreviews(files.map((file) => URL.createObjectURL(file)));
  }

  function clearPhotos() {
    photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    setCargoPhotos([]);
    setPhotoPreviews([]);
  }

  async function onSubmit(values) {
    if (!preferredTruckId || create.isPending || uploadingImage) return;
    setServerError("");
    try {
      const unit = values.weightUnit === "kg" ? "kg" : "tons";
      const request = await create.mutateAsync({
        pickup: formatSomaliaLocation(values.fromLocation, values.fromDistrict, values.fromRegion),
        destination: formatSomaliaLocation(values.toLocation, values.toDistrict, values.toRegion),
        truckType: values.truckType,
        weight: `${values.weightAmount} ${unit}`,
        description: `Cargo shipment weighing ${values.weightAmount} ${unit}`,
        preferredTruckId,
        loadType: "FTL",
        submissionKey: submissionKey.current
      });

      if (cargoPhotos[0] && request?.id) {
        setUploadingImage(true);
        try {
          const formData = new FormData();
          formData.append("cargoImage", cargoPhotos[0]);
          await api.uploadCargoImage(request.id, formData);
        } catch {
          // Photo upload is optional and must not invalidate a successfully created booking.
        } finally {
          setUploadingImage(false);
        }
      }

      navigate("/customer/shipments", { state: { created: request.id } });
    } catch (error) {
      setServerError(error.details?.issues?.[0]?.message || error.message);
    }
  }

  if (!preferredTruckId) {
    return <p className="py-16 text-center text-sm text-on-surface-variant">Choose an FTL truck to book…</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="FTL Booking"
        subtitle="Enter the route, cargo weight, and optional cargo photos."
      />

      <form
        className="mx-auto max-w-3xl space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] sm:p-7"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Selected Truck</p>
          <p className="mt-1 flex items-center gap-2 font-semibold text-primary">
            <Truck size={18} /> {truckLabel}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <LocationFields
            title="From"
            locationLabel="Pickup location"
            prefix="from"
            register={register}
            errors={errors}
            region={values.fromRegion}
            districts={fromDistricts}
            setValue={setValue}
          />
          <LocationFields
            title="To"
            locationLabel="Delivery location"
            prefix="to"
            register={register}
            errors={errors}
            region={values.toRegion}
            districts={toDistricts}
            setValue={setValue}
          />
        </div>

        <Field label="Truck Type" error={errors.truckType?.message}>
          <div className="relative">
            <Truck className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={17} />
            <input
              className="stitch-input w-full bg-surface-container-low pl-10"
              readOnly
              {...register("truckType", { required: "Truck type is required" })}
            />
          </div>
        </Field>

        <Field label="Weight" error={errors.weightAmount?.message}>
          <div className="grid grid-cols-[1fr_130px] gap-3">
            <div className="relative">
              <Package className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={17} />
              <input
                className="stitch-input w-full pl-10"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Enter amount"
                {...register("weightAmount", {
                  required: "Weight is required",
                  validate: (value) => Number(value) > 0 || "Weight must be greater than zero"
                })}
              />
            </div>
            <select className="stitch-input w-full" {...register("weightUnit")}>
              <option value="kg">Kilograms (kg)</option>
              <option value="tons">Tons</option>
            </select>
          </div>
        </Field>

        <Field label="Cargo Photos">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container p-6 text-center transition hover:border-primary hover:bg-primary/5">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={selectPhotos}
            />
            <ImagePlus className="text-primary" size={30} />
            <span className="mt-2 text-sm font-semibold text-on-surface">Select cargo photos</span>
            <span className="mt-1 text-xs text-on-surface-variant">JPG, PNG or WebP</span>
          </label>

          {photoPreviews.length > 0 && (
            <div className="mt-3">
              <div className="grid grid-cols-3 gap-3">
                {photoPreviews.map((url, index) => (
                  <img key={url} src={url} alt={`Cargo ${index + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                ))}
              </div>
              <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-error" onClick={clearPhotos}>
                <X size={14} /> Remove photos
              </button>
            </div>
          )}
        </Field>

        {serverError && <p className="rounded-lg bg-error/10 p-3 text-sm text-error">{serverError}</p>}

        <Button className="w-full" disabled={isSubmitting || create.isPending || uploadingImage}>
          {uploadingImage ? "Uploading photo…" : create.isPending ? "Sending request…" : "Request"}
        </Button>
      </form>
    </div>
  );
}

function LocationFields({ title, locationLabel, prefix, register, errors, region, districts, setValue }) {
  const regionField = `${prefix}Region`;
  const districtField = `${prefix}District`;
  const locationField = `${prefix}Location`;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
      <Field label="Region" error={errors[regionField]?.message}>
        <select
          className="stitch-input w-full"
          {...register(regionField, {
            required: `${title} region is required`,
            onChange: () => setValue(districtField, "", { shouldValidate: true })
          })}
        >
          <option value="">Select region</option>
          {somaliaRegions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="District" error={errors[districtField]?.message}>
        <select
          className="stitch-input w-full disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!region}
          {...register(districtField, { required: `${title} district is required` })}
        >
          <option value="">Select district</option>
          {districts.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </Field>
      <Field label={locationLabel} error={errors[locationField]?.message}>
        <input
          className="stitch-input w-full"
          placeholder={`Enter ${locationLabel.toLowerCase()}`}
          {...register(locationField, {
            required: `${locationLabel} is required`,
            validate: (value) => value.trim().length > 0 || `${locationLabel} cannot be blank`
          })}
        />
      </Field>
    </section>
  );
}

function Field({ label, children, error }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-on-surface-variant">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-error">{error}</span>}
    </label>
  );
}
