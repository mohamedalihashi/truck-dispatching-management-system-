import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { api } from "../services/api";

/**
 * Modal: driver uploads proof of delivery, then marks the trip Delivered.
 */
export function DeliveryProofModal({ trip, open, onClose, onDelivered, pending = false }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      await onDelivered({ id: trip.id, status: "Delivered" });
      clearFile();
    } catch (err) {
      setError(err.message || "Could not complete delivery");
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy || pending) return;
    clearFile();
    setError("");
    onClose();
  }

  const saving = busy || pending;

  return (
    <Modal title={`Delivered — ${trip.id}`} onClose={handleClose}>
      <p className="mb-3 text-sm text-on-surface-variant">
        {trip.pickup} → {trip.destination}. Upload proof of delivery (photo), then confirm Delivered.
      </p>
      <form className="space-y-3" onSubmit={handleSubmit}>
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
          <Button type="submit" disabled={saving || !file}>
            {saving ? "Saving…" : "Confirm Delivered"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
