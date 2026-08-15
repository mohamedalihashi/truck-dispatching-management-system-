import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { api } from "../services/api";

/**
 * Modal: driver enters customer confirm code + uploads POD, then marks Delivered.
 */
export function DeliveryProofModal({ trip, open, onClose, onDelivered, pending = false }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmCode("");
    setError("");
  }, [open, trip?.id]);

  if (!open || !trip) return null;

  function selectFile(event) {
    const next = event.target.files?.[0];
    if (!next) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setError("");
  }

  function clearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const code = String(confirmCode || "").trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Gali koodhka 6-digit ee macmiilka ku siiyay.");
      return;
    }
    if (!file) {
      setError("Upload a delivery photo (POD) before marking Delivered.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("proof", file);
      await api.uploadProof(trip.id, formData);
      await onDelivered({
        id: trip.id,
        status: "Delivered",
        deliveryConfirmCode: code,
      });
      clearFile();
      setConfirmCode("");
    } catch (err) {
      setError(err.message || "Could not complete delivery");
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy || pending) return;
    clearFile();
    setConfirmCode("");
    setError("");
    onClose();
  }

  const saving = busy || pending;

  return (
    <Modal title={`Delivered — ${trip.id}`} onClose={handleClose}>
      <p className="mb-3 text-sm text-on-surface-variant">
        {trip.pickup} → {trip.destination}. Weydii macmiilka{" "}
        <strong>koodhka xaqiijinta</strong>, gali halkan, ku dar sawirka POD, ka dib Confirm.
      </p>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-on-surface-variant">
            Koodhka xaqiijinta (macmiilka) *
          </span>
          <input
            className="stitch-input w-full tracking-[0.35em]"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="e.g. 899427"
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
            required
          />
          <p className="mt-1 text-[11px] text-on-surface-variant/70">
            Macmiilku wuxuu koodhka ka arkaa app-ka (Near Destination / Delivered).
          </p>
        </label>

        {!preview ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-8 text-center">
            <ImagePlus size={28} className="text-secondary" />
            <span className="text-sm font-semibold text-on-surface">Upload delivery photo</span>
            <span className="text-xs text-on-surface-variant">JPG, PNG, or WEBP</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={selectFile}
            />
          </label>
        ) : (
          <div className="relative overflow-hidden rounded-xl border border-outline-variant">
            <img src={preview} alt="Delivery proof preview" className="max-h-56 w-full object-cover" />
            <button
              type="button"
              className="absolute right-2 top-2 rounded-full bg-surface-container-lowest p-1.5 shadow"
              onClick={clearFile}
              aria-label="Remove photo"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !file || confirmCode.length !== 6}>
            {saving ? "Saving…" : "Confirm Delivered"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
