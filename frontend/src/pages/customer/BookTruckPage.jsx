import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { MapPin, Package, Truck, UserRound } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { useCreateCargo } from "../../hooks/useApi";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../services/api";
import { money } from "../../utils/helpers";
import {
  formatSomaliaLocation,
  somaliaLocations,
  somaliaRegions
} from "../../data/somaliaLocations";

const SOMALI_PHONE_PATTERN = /^(?:(?:\+|00)?252|0)?(?:6[1-9]|7\d|9\d)\d{7}$/;
const LOOSE_PHONE_PATTERN = /^\+?\d{7,15}$/;

function isValidPhone(value) {
  const cleaned = String(value || "").replace(/[\s()-]/g, "");
  return SOMALI_PHONE_PATTERN.test(cleaned) || LOOSE_PHONE_PATTERN.test(cleaned);
}

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function BookTruckPage() {
  const today = getLocalDateValue();
  const create = useCreateCargo();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [serverError, setServerError] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const submissionKey = useRef(crypto.randomUUID());
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm({
    defaultValues: {
      customerRole: "",
      fromRegion: "",
      fromDistrict: "",
      fromNeighborhood: "",
      toRegion: "",
      toDistrict: "",
      toNeighborhood: "",
      truckType: "",
      weight: "",
      preferredPickupDate: "",
      description: "",
      senderName: "",
      senderPhone: "",
      receiverName: "",
      receiverPhone: ""
    }
  });

  const values = watch();
  const fromDistricts = somaliaLocations[values.fromRegion] || [];
  const toDistricts = somaliaLocations[values.toRegion] || [];
  const profileReady = Boolean(user?.name?.trim() && isValidPhone(user?.phone));

  function changeRole(role) {
    setValue("customerRole", role, { shouldValidate: true });
    ["senderName", "senderPhone", "receiverName", "receiverPhone"].forEach((field) => {
      setValue(field, "", { shouldValidate: false });
    });
  }

  async function onSubmit(formValues) {
    setServerError("");
    if (!profileReady) {
      setServerError("Add your name and a phone number (at least 7 digits) in Profile before booking.");
      return;
    }
    try {
      const payload = {
        customerRole: formValues.customerRole,
        fromRegion: formValues.fromRegion,
        fromDistrict: formValues.fromDistrict,
        fromNeighborhood: formValues.fromNeighborhood.trim(),
        toRegion: formValues.toRegion,
        toDistrict: formValues.toDistrict,
        toNeighborhood: formValues.toNeighborhood.trim(),
        truckType: formValues.truckType.trim(),
        weight: String(formValues.weight).trim(),
        preferredPickupDate: formValues.preferredPickupDate,
        description: formValues.description.trim(),
        submissionKey: submissionKey.current
      };

      if (formValues.customerRole === "SENDER") {
        payload.receiverName = formValues.receiverName.trim();
        payload.receiverPhone = formValues.receiverPhone.trim();
      } else {
        payload.senderName = formValues.senderName.trim();
        payload.senderPhone = formValues.senderPhone.trim();
      }

      const request = await create.mutateAsync(payload);
      navigate("/customer/shipments", { state: { created: request.id } });
    } catch (err) {
      const issueMessage = err.details?.issues?.[0]?.message || err.issues?.[0]?.message;
      setServerError(issueMessage || err.message);
    }
  }

  const fromPreview = formatSomaliaLocation(values.fromNeighborhood, values.fromDistrict, values.fromRegion);
  const toPreview = formatSomaliaLocation(values.toNeighborhood, values.toDistrict, values.toRegion);

  useEffect(() => {
    if (!fromPreview || !toPreview || !values.weight || Number(values.weight) <= 0) {
      setEstimate(null);
      return;
    }

    const timer = setTimeout(() => {
      setEstimateLoading(true);
      api
        .estimatePricing({
          pickup: fromPreview,
          destination: toPreview,
          weight: values.weight
        })
        .then((result) => setEstimate(result))
        .catch(() => setEstimate(null))
        .finally(() => setEstimateLoading(false));
    }, 350);

    return () => clearTimeout(timer);
  }, [fromPreview, toPreview, values.weight]);

  return (
    <div className="space-y-8">
      <PageHeader title="Book a Truck" subtitle="Create a cargo request for pickup and delivery." />

      <div className="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-7 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] sm:p-6 lg:col-span-8"
        >
          <FormSection title="Customer Role">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["SENDER", "I am the Sender"],
                ["RECEIVER", "I am the Receiver"]
              ].map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-outline-variant px-4 py-3 text-sm font-medium hover:bg-surface-container-low"
                >
                  <input
                    type="radio"
                    value={value}
                    checked={values.customerRole === value}
                    onChange={() => changeRole(value)}
                    className="h-5 w-5"
                  />
                  {label}
                </label>
              ))}
            </div>
            <input type="hidden" {...register("customerRole", { required: "Select whether you are the sender or receiver" })} />
            <ErrorText message={errors.customerRole?.message} />
          </FormSection>

          <div className="grid gap-7 md:grid-cols-2">
            <FormSection title="From">
              <div className="space-y-4">
                <Field label="From Region" error={errors.fromRegion?.message}>
                  <select
                    className="stitch-input"
                    {...register("fromRegion", {
                      required: "From region is required",
                      onChange: () => setValue("fromDistrict", "", { shouldValidate: true })
                    })}
                  >
                    <option value="">Select region</option>
                    {somaliaRegions.map((region) => <option key={region}>{region}</option>)}
                  </select>
                </Field>
                <Field label="From District" error={errors.fromDistrict?.message}>
                  <select
                    className="stitch-input disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!values.fromRegion}
                    {...register("fromDistrict", { required: "From district is required" })}
                  >
                    <option value="">Select district</option>
                    {fromDistricts.map((district) => <option key={district}>{district}</option>)}
                  </select>
                </Field>
                <Field label="Xaafadda" error={errors.fromNeighborhood?.message}>
                  <input
                    className="stitch-input"
                    placeholder="Enter pickup neighborhood or detailed address"
                    {...register("fromNeighborhood", {
                      required: "From neighborhood is required",
                      validate: (value) => value.trim().length > 0 || "From neighborhood cannot be blank"
                    })}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection title="To">
              <div className="space-y-4">
                <Field label="To Region" error={errors.toRegion?.message}>
                  <select
                    className="stitch-input"
                    {...register("toRegion", {
                      required: "To region is required",
                      onChange: () => setValue("toDistrict", "", { shouldValidate: true })
                    })}
                  >
                    <option value="">Select region</option>
                    {somaliaRegions.map((region) => <option key={region}>{region}</option>)}
                  </select>
                </Field>
                <Field label="To District" error={errors.toDistrict?.message}>
                  <select
                    className="stitch-input disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!values.toRegion}
                    {...register("toDistrict", { required: "To district is required" })}
                  >
                    <option value="">Select district</option>
                    {toDistricts.map((district) => <option key={district}>{district}</option>)}
                  </select>
                </Field>
                <Field label="Xaafadda" error={errors.toNeighborhood?.message}>
                  <input
                    className="stitch-input"
                    placeholder="Enter delivery neighborhood or detailed address"
                    {...register("toNeighborhood", {
                      required: "To neighborhood is required",
                      validate: (value) => value.trim().length > 0 || "To neighborhood cannot be blank"
                    })}
                  />
                </Field>
              </div>
            </FormSection>
          </div>

          <FormSection title="Cargo Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Required Truck Type" error={errors.truckType?.message}>
                <input className="stitch-input" placeholder="Write the truck type you need" {...register("truckType", { required: "Truck type is required" })} />
              </Field>
              <Field label="Cargo Weight" error={errors.weight?.message}>
                <input
                  className="stitch-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Weight in tons"
                  {...register("weight", {
                    required: "Cargo weight is required",
                    validate: (value) => Number(value) > 0 || "Cargo weight must be positive"
                  })}
                />
              </Field>
              <Field label="Preferred Pickup Date" error={errors.preferredPickupDate?.message}>
                <input
                  className="stitch-input"
                  type="date"
                  min={today}
                  {...register("preferredPickupDate", {
                    required: "Preferred pickup date is required",
                    validate: (value) => value >= getLocalDateValue() || "Pickup date cannot be in the past"
                  })}
                />
              </Field>
              <Field label="Cargo Description" error={errors.description?.message} className="sm:col-span-2">
                <textarea
                  className="stitch-input min-h-24"
                  {...register("description", {
                    required: "Cargo description is required",
                    validate: (value) => value.trim().length > 0 || "Description cannot be blank"
                  })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Contact Details">
            {values.customerRole ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-surface-container-low p-4 text-sm">
                  <p className="font-semibold text-primary-container">
                    {values.customerRole === "SENDER" ? "Sender" : "Receiver"} (your profile)
                  </p>
                  <p className="mt-1 text-on-surface-variant">{user?.name || "Name missing"} · {user?.phone || "Phone missing"}</p>
                </div>
                {values.customerRole === "SENDER" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ContactFields party="Receiver" register={register} errors={errors} />
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ContactFields party="Sender" register={register} errors={errors} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">Select your customer role to enter the other contact.</p>
            )}
          </FormSection>

          {!profileReady && (
            <p className="rounded-lg bg-error/10 p-3 text-sm text-error">
              Profile name/phone is missing or too short. Open{" "}
              <a className="font-semibold underline" href="/customer/profile">
                Profile
              </a>{" "}
              and save a phone with at least 7 digits, then try again.
            </p>
          )}
          {serverError && <p className="rounded-lg bg-error/10 p-3 text-sm text-error">{serverError}</p>}
          <Button disabled={isSubmitting || create.isPending || !profileReady}>
            {create.isPending ? "Submitting…" : "Submit Cargo Request"}
          </Button>
        </form>

        <aside className="space-y-4 lg:col-span-4">
          <div className="rounded-xl border border-outline-variant bg-primary-container p-6 text-white shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
            <p className="text-xs font-medium uppercase tracking-wider text-on-primary-container">Route preview</p>
            <div className="mt-3 space-y-3">
              <p><span className="font-semibold">From:</span> {fromPreview || "Select pickup location"}</p>
              <p><span className="font-semibold">To:</span> {toPreview || "Select delivery location"}</p>
            </div>
            <div className="mt-6 space-y-3 text-sm text-on-primary-container">
              <p className="flex items-center gap-2"><Truck size={16} className="text-secondary-fixed" /> {values.truckType || "Truck type"}</p>
              <p className="flex items-center gap-2"><Package size={16} className="text-secondary-fixed" /> {values.weight ? `${values.weight} tons` : "Cargo weight"}</p>
              <p className="flex items-center gap-2"><UserRound size={16} className="text-secondary-fixed" /> {values.customerRole === "SENDER" ? "You are the sender" : values.customerRole === "RECEIVER" ? "You are the receiver" : "Customer role"}</p>
              <p className="flex items-center gap-2"><MapPin size={16} className="text-secondary-fixed" /> Somalia marketplace dispatch</p>
            </div>
          </div>

          <div className="rounded-xl border border-secondary-container/30 bg-secondary-fixed/15 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Suggested price</p>
            {estimateLoading ? (
              <p className="mt-2 text-sm text-on-surface-variant">Calculating…</p>
            ) : estimate ? (
              <div className="mt-2 space-y-1">
                <p className="text-2xl font-bold text-primary-container">{money(estimate.calculatedPrice)}</p>
                <p className="text-sm text-on-surface-variant">
                  ~{estimate.distanceKm} km · ETA {estimate.estimatedTime}
                </p>
                <p className="text-xs text-on-surface-variant">
                  Base {money(estimate.breakdown?.baseFee)} + distance {money(estimate.breakdown?.distanceCharge)} + weight{" "}
                  {money(estimate.breakdown?.weightCharge)}
                </p>
                <p className="pt-2 text-xs text-on-surface-variant">
                  This is an automatic estimate. Dispatcher may adjust before or when assigning a driver.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-on-surface-variant">
                Select pickup, delivery, and weight to see the automatic price.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ContactFields({ party, register, errors }) {
  const key = party.toLowerCase();
  return (
    <>
      <Field label={`${party} Name`} error={errors[`${key}Name`]?.message}>
        <input
          className="stitch-input"
          {...register(`${key}Name`, {
            required: `${party} name is required`,
            validate: (value) => value.trim().length > 0 || `${party} name cannot be blank`
          })}
        />
      </Field>
      <Field label={`${party} Phone Number`} error={errors[`${key}Phone`]?.message}>
        <input
          className="stitch-input"
          type="tel"
          placeholder="0612345678 or any 7+ digit phone"
          {...register(`${key}Phone`, {
            required: `${party} phone is required`,
            validate: (value) => isValidPhone(value) || "Enter a phone number with at least 7 digits"
          })}
        />
      </Field>
    </>
  );
}

function FormSection({ title, children }) {
  return (
    <section>
      <h2 className="mb-4 border-b border-outline-variant pb-2 text-lg font-semibold text-primary-container">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children, error, className = "" }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1.5 block font-medium text-on-surface-variant">{label}</span>
      {children}
      <ErrorText message={error} />
    </label>
  );
}

function ErrorText({ message }) {
  return message ? <span className="mt-1 block text-xs text-error">{message}</span> : null;
}
