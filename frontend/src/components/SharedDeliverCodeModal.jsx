import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

/**
 * Shared load deliver — driver enters the customer confirmation code.
 */
export function SharedDeliverCodeModal({
  booking = null,
  open,
  onClose,
  onConfirm,
  pending = false,
}) {
  const [confirmCode, setConfirmCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setConfirmCode("");
    setError("");
  }, [open, booking?.id]);

  if (!open || !booking) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const code = String(confirmCode || "").trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Gali koodhka 6-digit ee macmiilka ku siiyay.");
      return;
    }
    setError("");
    try {
      await onConfirm({ bookingId: booking.id, deliveryConfirmCode: code });
    } catch (err) {
      setError(err.message || "Could not deliver load");
    }
  }

  return (
    <Modal title={`Delivered — ${booking.cargoRequestId || booking.id}`} onClose={onClose}>
      <p className="mb-3 text-sm text-on-surface-variant">
        Macmiil: <strong>{booking.customer || "—"}</strong>. Weydii{" "}
        <strong>koodhka xaqiijinta</strong> ka dibna Confirm.
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
        </label>
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || confirmCode.length !== 6}>
            {pending ? "Saving…" : "Confirm Delivered"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
