import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { ImagePlus, X } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { useCreateCargo } from "../../hooks/useApi";
import { api } from "../../services/api";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  formatSomaliaLocation,
  somaliaLocations,
  somaliaRegions
} from "../../data/somaliaLocations";
import { BOOKING_MESSAGES, applyFormValidationIssues } from "../../utils/bookingValidation";

/**
 * Customer posts a SHARED capacity request (route + cargo type).
 * Weight is set later (admin / driver). No sender/receiver forms.
 */
export function SharedBookingPage() {
  const { t } = useLanguage();
  const create = useCreateCargo();
  const navigate = useNavigate();
  const submissionKey = useRef(crypto.randomUUID());
  const [cargoPhoto, setCargoPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting }
  } = useForm({
    defaultValues: {
      fromRegion: "",
      fromDistrict: "",
      fromNeighborhood: "",
      toRegion: "",
      toDistrict: "",
      toNeighborhood: "",
      cargoType: ""
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
    setPhotoError("");
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setCargoPhoto(null);
    setPhotoPreview("");
  }

  async function onSubmit(formValues) {
    if (create.isPending || uploadingImage) return;
    if (!cargoPhoto) {
      setPhotoError("Cargo photo is required");
      return;
    }
    setServerError("");
    setPhotoError("");
    try {
      const cargoType = formValues.cargoType?.trim() || "";
      const request = await create.mutateAsync({
        pickup: formatSomaliaLocation(
          formValues.fromNeighborhood,
          formValues.fromDistrict,
          formValues.fromRegion
        ),
        destination: formatSomaliaLocation(
          formValues.toNeighborhood,
          formValues.toDistrict,
          formValues.toRegion
        ),
        fromRegion: formValues.fromRegion,
        fromDistrict: formValues.fromDistrict,
        fromNeighborhood: formValues.fromNeighborhood,
        toRegion: formValues.toRegion,
        toDistrict: formValues.toDistrict,
        toNeighborhood: formValues.toNeighborhood,
        truckType: "General",
        cargoType: cargoType || undefined,
        weight: "TBD",
        description: cargoType
          ? `Shared load request — ${cargoType}`
          : "Shared load request",
        submissionKey: submissionKey.current,
        loadType: "SHARED"
      });

      setUploadingImage(true);
      try {
        const formData = new FormData();
        formData.append("cargoImage", cargoPhoto);
        await api.uploadCargoImage(request.id, formData);
      } catch (uploadError) {
        setServerError(uploadError.message || "Cargo photo upload failed. Please try again.");
        return;
      } finally {
        setUploadingImage(false);
      }

      navigate("/customer/trips", {
        state: {
          created: request.id,
          message: "Shared request submitted. Admin will group loads and assign one truck. Pay 100% after Delivered."
        }
      });
    } catch (error) {
      if (error.issues) applyFormValidationIssues(setError, error.issues);
      setServerError(error.details?.issues?.[0]?.message || error.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("customer.sharedBookPageTitle") || "Shared load request"}
        subtitle="Submit your route and cargo details. Admin assigns a SHARED truck. Weight is confirmed later. You pay 100% after Delivered."
        actions={
          <Link to="/customer/find-trucks">
            <Button variant="secondary">{t("customer.ftlInstead") || "Need a full truck?"}</Button>
          </Link>
        }
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mx-auto max-w-3xl space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] sm:p-7"
      >
        <div className="rounded-xl border border-secondary-container/30 bg-secondary-container/10 px-4 py-3 text-sm text-on-surface">
          Shared = partial capacity. Admin collects matching requests, assigns <strong>one truck</strong>, then you pay after delivery.
        </div>

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

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Cargo type *</span>
          <input
            className="stitch-input w-full"
            placeholder="e.g. Food, cement"
            {...register("cargoType", { required: BOOKING_MESSAGES.cargoTypeRequired })}
          />
          {errors.cargoType ? <span className="mt-1 block text-xs text-error">{errors.cargoType.message}</span> : null}
        </label>

        <div>
          <p className="mb-2 text-xs font-semibold text-on-surface-variant">Cargo photo</p>
          {photoPreview ? (
            <div className="relative inline-block">
              <img src={photoPreview} alt="Cargo" className="h-32 w-32 rounded-xl object-cover" />
              <button
                type="button"
                className="absolute -right-2 -top-2 rounded-full bg-error p-1 text-white"
                onClick={removePhoto}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-8 text-sm text-on-surface-variant hover:border-secondary">
              <ImagePlus size={28} />
              <span>Upload cargo photo</span>
              <input type="file" accept="image/*" className="hidden" onChange={selectPhoto} />
            </label>
          )}
          {photoError ? <p className="mt-1 text-sm text-error">{photoError}</p> : null}
        </div>

        {serverError ? <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">{serverError}</p> : null}

        <Button className="w-full" disabled={isSubmitting || create.isPending || uploadingImage}>
          {uploadingImage || create.isPending ? "Submitting…" : "Submit shared request"}
        </Button>
      </form>
    </div>
  );
}

function LocationFields({ title, prefix, register, errors, region, districts, setValue }) {
  const regionField = `${prefix}Region`;
  const districtField = `${prefix}District`;
  const neighborhoodField = `${prefix}Neighborhood`;
  const regionRequired =
    prefix === "from" ? BOOKING_MESSAGES.fromRegionRequired : BOOKING_MESSAGES.toRegionRequired;
  const districtRequired =
    prefix === "from" ? BOOKING_MESSAGES.fromDistrictRequired : BOOKING_MESSAGES.toDistrictRequired;
  const neighborhoodRequired =
    prefix === "from" ? BOOKING_MESSAGES.fromNeighborhoodRequired : BOOKING_MESSAGES.toNeighborhoodRequired;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-primary-container">{title}</legend>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-on-surface-variant">Region *</span>
        <select
          className="stitch-input w-full"
          {...register(regionField, {
            required: regionRequired,
            validate: (value) => {
              const selected = String(value || "").trim();
              if (!selected) return regionRequired;
              return somaliaRegions.includes(selected) || BOOKING_MESSAGES.invalidRegion;
            },
            onChange: () => setValue(districtField, "")
          })}
        >
          <option value="">Select region</option>
          {somaliaRegions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        {errors?.[regionField] ? <span className="text-xs text-error">{errors[regionField].message}</span> : null}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-on-surface-variant">District *</span>
        <select
          className="stitch-input w-full"
          disabled={!region}
          {...register(districtField, {
            required: districtRequired,
            validate: (value) => {
              const selected = String(value || "").trim();
              if (!selected) return districtRequired;
              if (!region) return true;
              return districts.includes(selected) || BOOKING_MESSAGES.invalidDistrict;
            }
          })}
        >
          <option value="">{region ? "Select district" : "Select region first"}</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {errors?.[districtField] ? <span className="text-xs text-error">{errors[districtField].message}</span> : null}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-on-surface-variant">Neighborhood / landmark *</span>
        <input
          className="stitch-input w-full"
          {...register(neighborhoodField, {
            required: neighborhoodRequired,
            validate: (value) => String(value || "").trim().length > 0 || neighborhoodRequired
          })}
        />
        {errors?.[neighborhoodField] ? (
          <span className="text-xs text-error">{errors[neighborhoodField].message}</span>
        ) : null}
      </label>
    </fieldset>
  );
}
