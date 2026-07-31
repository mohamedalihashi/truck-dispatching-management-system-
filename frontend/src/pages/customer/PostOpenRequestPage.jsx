import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { Gavel, ImagePlus, Package, Truck, X } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { useCreateCargo } from "../../hooks/useApi";
import { api } from "../../services/api";
import {
  formatSomaliaLocation,
  somaliaLocations,
  somaliaRegions
} from "../../data/somaliaLocations";

export function PostOpenRequestPage() {
  const create = useCreateCargo();
  const navigate = useNavigate();
  const submissionKey = useRef(crypto.randomUUID());
  const [cargoPhoto, setCargoPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
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
      fromNeighborhood: "",
      toRegion: "",
      toDistrict: "",
      toNeighborhood: "",
      truckType: "",
      weightAmount: "",
      weightUnit: "tons"
    }
  });
  const values = watch();
  const fromDistricts = somaliaLocations[values.fromRegion] || [];
  const toDistricts = somaliaLocations[values.toRegion] || [];

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

  async function onSubmit(values) {
    if (create.isPending || uploadingImage) return;
    setServerError("");
    try {
      const unit = values.weightUnit === "kg" ? "kg" : "tons";
      const request = await create.mutateAsync({
        pickup: formatSomaliaLocation(values.fromNeighborhood, values.fromDistrict, values.fromRegion),
        destination: formatSomaliaLocation(values.toNeighborhood, values.toDistrict, values.toRegion),
        truckType: values.truckType.trim(),
        weight: `${values.weightAmount} ${unit}`,
        description: `Open FTL request for ${values.weightAmount} ${unit} of cargo`,
        submissionKey: submissionKey.current,
        loadType: "FTL",
        openForBids: true
      });

      if (cargoPhoto && request?.id) {
        setUploadingImage(true);
        try {
          const formData = new FormData();
          formData.append("cargoImage", cargoPhoto);
          await api.uploadCargoImage(request.id, formData);
        } catch {
          // A photo is optional; the successfully created request remains valid.
        } finally {
          setUploadingImage(false);
        }
      }

      navigate("/customer/shipments", { state: { created: request.id } });
    } catch (error) {
      setServerError(error.details?.issues?.[0]?.message || error.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="FTL Request"
        subtitle="Enter your route and cargo weight. FTL drivers can send their offers."
        actions={
          <Link to="/customer/find-trucks">
            <Button variant="secondary">Book a specific truck</Button>
          </Link>
        }
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mx-auto max-w-3xl space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] sm:p-7"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <LocationFields
            title="From"
            prefix="from"
            register={register}
            errors={errors}
            region={values.fromRegion}
            districts={fromDistricts}
            setValue={setValue}
          />
          <LocationFields
            title="To"
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
              className="stitch-input w-full pl-10"
              placeholder="e.g. Box truck, Flatbed"
              {...register("truckType", {
                required: "Truck type is required",
                validate: (value) => value.trim().length > 0 || "Truck type cannot be blank"
              })}
            />
          </div>
        </Field>

        <Field label="Weight" error={errors.weightAmount?.message}>
          <div className="grid grid-cols-[1fr_140px] gap-3">
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

        <Field label="Cargo Photo">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container p-6 text-center transition hover:border-primary hover:bg-primary/5">
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={selectPhoto} />
            {photoPreview ? (
              <img src={photoPreview} alt="Cargo preview" className="max-h-52 rounded-lg object-cover" />
            ) : (
              <>
                <ImagePlus className="text-primary" size={30} />
                <span className="mt-2 text-sm font-semibold text-on-surface">Select cargo photo</span>
                <span className="mt-1 text-xs text-on-surface-variant">JPG, PNG or WebP — optional</span>
              </>
            )}
          </label>
          {photoPreview && (
            <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-error" onClick={removePhoto}>
              <X size={14} /> Remove photo
            </button>
          )}
        </Field>

        {serverError && <p className="rounded-lg bg-error/10 p-3 text-sm text-error">{serverError}</p>}

        <Button className="w-full" type="submit" disabled={isSubmitting || create.isPending || uploadingImage}>
          <Gavel size={16} />
          {uploadingImage ? "Uploading photo…" : create.isPending ? "Sending request…" : "Request"}
        </Button>
      </form>
    </div>
  );
}

function LocationFields({ title, prefix, register, errors, region, districts, setValue }) {
  const regionField = `${prefix}Region`;
  const districtField = `${prefix}District`;
  const neighborhoodField = `${prefix}Neighborhood`;

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
      <Field label="Neighborhood / Address" error={errors[neighborhoodField]?.message}>
        <input
          className="stitch-input w-full"
          placeholder="Enter neighborhood or address"
          {...register(neighborhoodField, {
            required: `${title} neighborhood is required`,
            validate: (value) => value.trim().length > 0 || "Neighborhood cannot be blank"
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
