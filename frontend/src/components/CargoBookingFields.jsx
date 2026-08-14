import { ImagePlus, Package, X } from "lucide-react";
import {
  formatSomaliaLocation,
  somaliaLocations,
  somaliaRegions
} from "../data/somaliaLocations";
import { BOOKING_MESSAGES, validateFullNameField } from "../utils/bookingValidation";
import { LIVESTOCK_CARGO_TYPES } from "../utils/cargoMeasurement";

export const CARGO_TYPES = [
  "General goods",
  "Food & beverages",
  "Construction materials",
  ...LIVESTOCK_CARGO_TYPES,
  "Fuel & oil",
  "Water",
  "Electronics",
  "Furniture",
  "Perishables",
  "Agricultural produce",
  "Others"
];

export const EMPTY_CARGO_BOOKING = {
  customerId: "",
  loadType: "FTL",
  fromRegion: "",
  fromDistrict: "",
  fromNeighborhood: "",
  toRegion: "",
  toDistrict: "",
  toNeighborhood: "",
  cargoType: "",
  cargoTypeOther: "",
  specialInstructions: ""
};

export function buildCargoBookingPayload(formValues, { requireCustomer = false } = {}) {
  const otherType = String(formValues.cargoTypeOther || "").trim();
  const resolvedCargoType =
    formValues.cargoType === "Others" ? otherType : String(formValues.cargoType || "").trim();

  if (!resolvedCargoType || resolvedCargoType.length < 2) {
    throw new Error(BOOKING_MESSAGES.cargoTypeRequired);
  }
  if (requireCustomer && !formValues.customerId) {
    throw new Error("Select a customer");
  }

  const pickup = formatSomaliaLocation(
    formValues.fromNeighborhood,
    formValues.fromDistrict,
    formValues.fromRegion
  );
  const destination = formatSomaliaLocation(
    formValues.toNeighborhood,
    formValues.toDistrict,
    formValues.toRegion
  );

  return {
    ...(formValues.customerId ? { customerId: formValues.customerId } : {}),
    pickup,
    destination,
    fromRegion: formValues.fromRegion,
    fromDistrict: formValues.fromDistrict,
    fromNeighborhood: formValues.fromNeighborhood,
    toRegion: formValues.toRegion,
    toDistrict: formValues.toDistrict,
    toNeighborhood: formValues.toNeighborhood,
    cargoType: resolvedCargoType,
    truckType: "Any",
    weight: "TBD",
    description: resolvedCargoType,
    loadType: formValues.loadType === "SHARED" ? "SHARED" : "FTL",
    specialInstructions: formValues.specialInstructions?.trim() || undefined,
    ...(String(formValues.senderName || "").trim()
      ? { senderName: String(formValues.senderName).trim() }
      : {}),
    ...(String(formValues.senderPhone || "").trim()
      ? { senderPhone: String(formValues.senderPhone).trim() }
      : {}),
    ...(String(formValues.receiverName || "").trim()
      ? { receiverName: String(formValues.receiverName).trim() }
      : {}),
    ...(String(formValues.receiverPhone || "").trim()
      ? { receiverPhone: String(formValues.receiverPhone).trim() }
      : {})
  };
}

export function bookingDefaultsFromRequest(row = {}) {
  let cargoType = row.cargoType || "";
  if (cargoType && !CARGO_TYPES.includes(cargoType)) {
    if (String(cargoType).toLowerCase() === "livestock") {
      cargoType = LIVESTOCK_CARGO_TYPES.find((t) => t.includes("Ari")) || LIVESTOCK_CARGO_TYPES[1];
    } else {
      cargoType = "Others";
    }
  }
  const known = CARGO_TYPES.includes(cargoType) ? cargoType : "";
  return {
    fromRegion: row.fromRegion || "",
    fromDistrict: row.fromDistrict || "",
    fromNeighborhood: row.fromNeighborhood || "",
    toRegion: row.toRegion || "",
    toDistrict: row.toDistrict || "",
    toNeighborhood: row.toNeighborhood || "",
    cargoType: known,
    cargoTypeOther: known === "Others" ? row.cargoType || "" : "",
    specialInstructions: row.specialInstructions || "",
    loadType: row.loadType === "SHARED" ? "SHARED" : "FTL"
  };
}

function Field({ label, children, error, className = "" }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1.5 block font-medium text-on-surface-variant">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-error">{error}</span> : null}
    </label>
  );
}

function LocationFields({ title, locationLabel, prefix, register, errors, region, setValue }) {
  const regionField = `${prefix}Region`;
  const districtField = `${prefix}District`;
  const neighborhoodField = `${prefix}Neighborhood`;
  const districts = somaliaLocations[region] || [];
  const regionRequired =
    prefix === "from" ? BOOKING_MESSAGES.fromRegionRequired : BOOKING_MESSAGES.toRegionRequired;
  const districtRequired =
    prefix === "from" ? BOOKING_MESSAGES.fromDistrictRequired : BOOKING_MESSAGES.toDistrictRequired;
  const neighborhoodRequired =
    prefix === "from" ? BOOKING_MESSAGES.fromNeighborhoodRequired : BOOKING_MESSAGES.toNeighborhoodRequired;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
      <Field label="Region *" error={errors[regionField]?.message}>
        <select
          className="stitch-input w-full"
          {...register(regionField, {
            required: regionRequired,
            validate: (value) => {
              const selected = String(value || "").trim();
              if (!selected) return regionRequired;
              return somaliaRegions.includes(selected) || BOOKING_MESSAGES.invalidRegion;
            },
            onChange: () => setValue(districtField, "", { shouldValidate: true })
          })}
        >
          <option value="">Select region</option>
          {somaliaRegions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </Field>
      <Field label="District *" error={errors[districtField]?.message}>
        <select
          className="stitch-input w-full disabled:cursor-not-allowed disabled:opacity-60"
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
          <option value="">Select district</option>
          {districts.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`${locationLabel} *`} error={errors[neighborhoodField]?.message}>
        <input
          className="stitch-input w-full"
          placeholder={`Enter ${locationLabel.toLowerCase()}`}
          {...register(neighborhoodField, {
            required: neighborhoodRequired,
            validate: (value) => String(value || "").trim().length > 0 || neighborhoodRequired
          })}
        />
      </Field>
    </section>
  );
}

/**
 * Modern cargo booking fields (Somalia locations + cargo type + optional photo).
 * Matches the customer FTL / Shared booking flow.
 */
export function CargoBookingFields({
  register,
  errors,
  watch,
  setValue,
  customers = null,
  showLoadType = true,
  showSpecialInstructions = true,
  showContactFields = false,
  photoPreview = "",
  photoError = "",
  onSelectPhoto,
  onClearPhoto,
  requirePhoto = false
}) {
  const values = watch();
  const isOthersCargo = values.cargoType === "Others";

  return (
    <div className="space-y-5 sm:col-span-2">
      {customers ? (
        <Field label="Customer *" error={errors.customerId?.message}>
          <select className="stitch-input w-full" {...register("customerId", { required: "Select a customer" })}>
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {showLoadType ? (
        <Field label="Load type *">
          <select className="stitch-input w-full" {...register("loadType")}>
            <option value="FTL">FTL — full truck</option>
            <option value="SHARED">SHARED — shared capacity</option>
          </select>
        </Field>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <LocationFields
          title="From / Qaadis"
          locationLabel="Pickup location"
          prefix="from"
          register={register}
          errors={errors}
          region={values.fromRegion}
          setValue={setValue}
        />
        <LocationFields
          title="To / Geeyn"
          locationLabel="Delivery location"
          prefix="to"
          register={register}
          errors={errors}
          region={values.toRegion}
          setValue={setValue}
        />
      </div>

      <section className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-low/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">Cargo details</h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Weight is entered by the driver at pickup. Fare uses Settings → Pricing (kg + GPS km).
          </p>
        </div>

        <Field label="Cargo type / Nooca alaabta *" error={errors.cargoType?.message}>
          <div className="relative">
            <Package className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={17} />
            <select
              className="stitch-input w-full pl-10"
              {...register("cargoType", {
                required: BOOKING_MESSAGES.cargoTypeRequired,
                onChange: (event) => {
                  if (event.target.value !== "Others") {
                    setValue("cargoTypeOther", "");
                  }
                }
              })}
            >
              <option value="">Select cargo type</option>
              {CARGO_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </Field>

        {isOthersCargo ? (
          <Field label="Describe cargo *" error={errors.cargoTypeOther?.message}>
            <textarea
              className="stitch-input min-h-[80px] w-full"
              placeholder="e.g. bottles, market goods…"
              maxLength={100}
              {...register("cargoTypeOther", {
                required: isOthersCargo ? "Describe the cargo type" : false,
                validate: (value) =>
                  !isOthersCargo || String(value || "").trim().length >= 2 || "Enter at least 2 characters"
              })}
            />
          </Field>
        ) : null}

        {showContactFields ? (
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Sender name" error={errors.senderName?.message}>
              <input
                className="stitch-input w-full"
                placeholder="e.g. Cabdi Axmed Xaashi"
                {...register("senderName", {
                  validate: (value) => validateFullNameField(value, { label: "Sender name" })
                })}
              />
            </Field>
            <Field label="Sender phone" error={errors.senderPhone?.message}>
              <input
                className="stitch-input w-full"
                inputMode="tel"
                {...register("senderPhone", {
                  validate: (value) => {
                    const phone = String(value || "").trim();
                    if (!phone) return true;
                    const digits = phone.replace(/\D/g, "");
                    return digits.length >= 7 || BOOKING_MESSAGES.phoneInvalid;
                  }
                })}
              />
            </Field>
            <Field label="Receiver name" error={errors.receiverName?.message}>
              <input
                className="stitch-input w-full"
                placeholder="e.g. Sahra Ali"
                {...register("receiverName", {
                  validate: (value) => validateFullNameField(value, { label: "Receiver name" })
                })}
              />
            </Field>
            <Field label="Receiver phone" error={errors.receiverPhone?.message}>
              <input
                className="stitch-input w-full"
                inputMode="tel"
                {...register("receiverPhone", {
                  validate: (value) => {
                    const phone = String(value || "").trim();
                    if (!phone) return true;
                    const digits = phone.replace(/\D/g, "");
                    return digits.length >= 7 || BOOKING_MESSAGES.phoneInvalid;
                  }
                })}
              />
            </Field>
          </section>
        ) : null}

        {onSelectPhoto ? (
          <Field label={`Cargo photo${requirePhoto ? " *" : " (optional)"}`} error={photoError}>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-surface-container p-5 text-center transition hover:border-primary hover:bg-primary/5 ${
                photoError ? "border-error" : "border-outline-variant"
              }`}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={onSelectPhoto}
              />
              {photoPreview ? (
                <img src={photoPreview} alt="Cargo preview" className="max-h-44 rounded-lg object-cover" />
              ) : (
                <>
                  <ImagePlus className="text-primary" size={28} />
                  <span className="mt-2 text-sm font-semibold text-on-surface">Select cargo photo</span>
                  <span className="mt-1 text-xs text-on-surface-variant">JPG, PNG or WebP</span>
                </>
              )}
            </label>
            {photoPreview && onClearPhoto ? (
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-error"
                onClick={onClearPhoto}
              >
                <X size={14} /> Remove photo
              </button>
            ) : null}
          </Field>
        ) : null}

        {showSpecialInstructions ? (
          <Field label="Special instructions">
            <textarea
              className="stitch-input min-h-16 w-full"
              placeholder="Optional notes"
              {...register("specialInstructions")}
            />
          </Field>
        ) : null}
      </section>
    </div>
  );
}
