import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import {
  CargoBookingFields,
  EMPTY_CARGO_BOOKING,
  buildCargoBookingPayload
} from "../../components/CargoBookingFields";
import { useCreateCargo } from "../../hooks/useApi";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../services/api";
import { applyFormValidationIssues } from "../../utils/bookingValidation";

export function BookTruckPage() {
  const create = useCreateCargo();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
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
      ...EMPTY_CARGO_BOOKING,
      loadType: "FTL"
    }
  });

  function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setCargoPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoError("");
  }

  function clearPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setCargoPhoto(null);
    setPhotoPreview("");
  }

  async function onSubmit(formValues) {
    if (create.isPending || uploadingImage) return;
    if (!cargoPhoto) {
      setPhotoError("Sawirka alaabta waa loo baahan yahay / Cargo photo is required");
      return;
    }
    setServerError("");
    setPhotoError("");
    try {
      // Ensure role matches the customer book page (stale session after role change).
      const latest = await refreshUser().catch(() => user);
      if (latest?.role && latest.role !== "customer") {
        setServerError("Log in with a customer account to submit this request.");
        return;
      }
      const payload = {
        ...buildCargoBookingPayload({ ...formValues, loadType: "FTL" }),
        submissionKey: submissionKey.current
      };
      // Customer bookings use the logged-in account — never send empty customerId.
      delete payload.customerId;
      const request = await create.mutateAsync(payload);

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

      navigate("/customer/trips", { state: { created: request.id } });
    } catch (error) {
      if (error.issues) applyFormValidationIssues(setError, error.issues);
      setServerError(error.details?.issues?.[0]?.message || error.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="FTL Request"
        subtitle="Gali waddada, nooca alaabta, iyo sawirkeeda. Admin ayaa darawal u qoondeeya."
      />

      <form
        className="mx-auto max-w-3xl space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] sm:p-7"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="rounded-xl border border-secondary-container/30 bg-secondary-container/10 px-4 py-3 text-sm text-on-surface">
          Admin assigns the truck and driver. Pay 100% after the trip is Delivered.
        </div>

        <CargoBookingFields
          register={register}
          errors={errors}
          watch={watch}
          setValue={setValue}
          showLoadType={false}
          showSpecialInstructions
          showContactFields
          photoPreview={photoPreview}
          photoError={photoError}
          onSelectPhoto={selectPhoto}
          onClearPhoto={clearPhoto}
          requirePhoto
        />

        {serverError && <p className="rounded-lg bg-error/10 p-3 text-sm text-error">{serverError}</p>}

        <Button className="w-full" disabled={isSubmitting || create.isPending || uploadingImage}>
          {uploadingImage ? "Uploading photo…" : create.isPending ? "Submitting…" : "Submit request"}
        </Button>
      </form>
    </div>
  );
}
