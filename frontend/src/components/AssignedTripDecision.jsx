import { useState } from "react";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { useTripActions } from "../hooks/useApi";

/**
 * Assigned job decision: Accept or Reject only (no fare/ETA edit).
 */
export function AssignedTripDecision({ trip, compact = false }) {
  const actions = useTripActions();
  const [mode, setMode] = useState(null); // "reject" | null
  const [error, setError] = useState("");

  if (!trip || trip.status !== "Assigned") return null;

  async function onAccept() {
    setError("");
    try {
      await actions.accept.mutateAsync(trip.id);
    } catch (err) {
      setError(err.message || "Could not accept trip");
    }
  }

  async function onConfirmReject() {
    setError("");
    try {
      await actions.reject.mutateAsync(trip.id);
      setMode(null);
    } catch (err) {
      setError(err.message || "Could not reject trip");
    }
  }

  const busy = actions.accept.isPending || actions.reject.isPending;

  return (
    <>
      <div className={`flex flex-col items-stretch gap-2 ${compact ? "" : "mt-2"}`}>
        <Button type="button" className="px-3 py-1 text-xs" disabled={busy} onClick={onAccept}>
          {actions.accept.isPending ? "Accepting…" : "Accept"}
        </Button>
        <Button
          type="button"
          variant="danger"
          className="px-3 py-1 text-xs"
          disabled={busy}
          onClick={() => {
            setError("");
            setMode("reject");
          }}
        >
          Reject
        </Button>
      </div>

      {error ? <p className="mt-2 max-w-sm text-xs text-error">{error}</p> : null}

      {mode === "reject" ? (
        <Modal title={`Reject ${trip.id}?`} onClose={() => setMode(null)}>
          <p className="text-sm text-on-surface-variant">
            Haddii aadan rabin shaqadan, Reject — admin ayaa mar kale u qoondayn doona. Fare iyo route ma beddeli kartid.
          </p>
          {error ? <p className="mt-3 text-sm text-error">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode(null)}>
              Keep assignment
            </Button>
            <Button type="button" variant="danger" disabled={busy} onClick={onConfirmReject}>
              {actions.reject.isPending ? "Rejecting…" : "Reject job"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
