import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { api } from "../services/api";

/**
 * One Accept/Reject for the whole shared assignment (all loads, same corridor).
 */
export function SharedTripDecision({ trip, compact = false, onDone }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState(null);
  const [error, setError] = useState("");

  const accept = useMutation({
    mutationFn: () => api.acceptSharedTrip(trip.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-trip", trip.id] });
      qc.invalidateQueries({ queryKey: ["shared-trips-me"] });
      qc.invalidateQueries({ queryKey: ["shared-trips-summary"] });
      qc.invalidateQueries({ queryKey: ["my-shared-trips-dashboard"] });
      onDone?.();
    },
  });

  const reject = useMutation({
    mutationFn: () => api.rejectSharedTrip(trip.id),
    onSuccess: () => {
      setMode(null);
      qc.invalidateQueries({ queryKey: ["shared-trip", trip.id] });
      qc.invalidateQueries({ queryKey: ["shared-trips-me"] });
      qc.invalidateQueries({ queryKey: ["shared-trips-summary"] });
      qc.invalidateQueries({ queryKey: ["my-shared-trips-dashboard"] });
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
      onDone?.();
    },
  });

  if (!trip || trip.status !== "Assigned") return null;

  const busy = accept.isPending || reject.isPending;
  const loads = trip.bookingsCount ?? trip.bookings?.length ?? 0;

  async function onAccept() {
    setError("");
    try {
      await accept.mutateAsync();
    } catch (err) {
      setError(err.message || "Could not accept");
      setMode("error");
    }
  }

  async function onConfirmReject() {
    setError("");
    try {
      await reject.mutateAsync();
    } catch (err) {
      setError(err.message || "Could not reject");
    }
  }

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "mt-2"}`}>
        <Button type="button" className="px-3 py-1 text-xs" disabled={busy} onClick={onAccept}>
          {accept.isPending ? "Accepting…" : "Accept all"}
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
      {!compact ? (
        <p className="mt-2 text-xs text-on-surface-variant">
          Hal shaqo: {loads || "?"} load(s) — isku corridor. Accept mid ah.
        </p>
      ) : null}

      {mode === "error" && error ? (
        <p className="mt-2 max-w-sm text-xs text-error">{error}</p>
      ) : null}

      {mode === "reject" ? (
        <Modal title={`Reject ${trip.id}?`} onClose={() => setMode(null)}>
          <p className="text-sm text-on-surface-variant">
            Dhammaan loads-ka ({loads || "?"}) waxay ku noqonayaan Pending — admin ayaa mar kale u qoondayn doona.
          </p>
          {error ? <p className="mt-3 text-sm text-error">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode(null)}>
              Keep assignment
            </Button>
            <Button variant="danger" disabled={busy} onClick={onConfirmReject}>
              {reject.isPending ? "Rejecting…" : "Reject all loads"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
