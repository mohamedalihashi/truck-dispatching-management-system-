import { CreditCard, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/Button";
import { WaafiPayModal } from "./WaafiPayModal";
import { usePaymentMutations, useQuoteMutations } from "../hooks/useApi";
import { money, paymentBalance } from "../utils/helpers";
import { api } from "../services/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TripPaymentJourney, paymentBreakdown } from "./TripPaymentJourney";

/** Driver quote accept/reject + immediate 30% deposit so the trip can start. */
export function QuoteReviewPanel({ request, onUpdated }) {
  const navigate = useNavigate();
  const quotes = useQuoteMutations();
  const { payWithWaafi } = usePaymentMutations();
  const qc = useQueryClient();
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState("");
  const [depositPayment, setDepositPayment] = useState(null);
  const [payError, setPayError] = useState("");
  const [acceptedMsg, setAcceptedMsg] = useState("");

  const preparePay = useMutation({
    mutationFn: (id) => api.payQuote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
    }
  });

  if (!request) return null;

  const awaitingCustomer = request.status === "Awaiting Approval";
  const waitingDriver = request.status === "Pending" && Boolean(request.driverId);
  const quoteRejected = request.status === "Quote Rejected";
  const displayPrice = request.quotedPrice ?? request.finalPrice;
  const breakdown = paymentBreakdown(displayPrice);
  const needsDeposit =
    ["Assigned", "Approved"].includes(request.status) &&
    (!depositPayment || Number(depositPayment.amountPaid || 0) < Number(depositPayment.depositAmount || breakdown.deposit) - 0.01);
  const canPayLater = ["Assigned", "Accepted", "Arrived Pickup", "Loaded", "In Transit", "Delivered", "Approved"].includes(
    request.status
  );

  async function openDepositCheckout(requestId) {
    const result = await preparePay.mutateAsync(requestId);
    setDepositPayment(result.payment);
    setPayError("");
    return result.payment;
  }

  async function handleAcceptAndPay() {
    setError("");
    setAcceptedMsg("");
    try {
      const updated = await quotes.accept.mutateAsync(request.id);
      onUpdated?.(updated);
      setAcceptedMsg("FTL offer accepted. Pay the 30% deposit now so the trip can start.");
      await openDepositCheckout(request.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePayDeposit() {
    setError("");
    try {
      await openDepositCheckout(request.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReject() {
    if (!confirm("Reject this driver's price and time?")) return;
    setError("");
    try {
      const updated = await quotes.reject.mutateAsync({ id: request.id, note: rejectNote.trim() || undefined });
      onUpdated?.(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onWaafiPay(payload) {
    setPayError("");
    try {
      const result = await payWithWaafi.mutateAsync(payload);
      setDepositPayment(null);
      const remaining = paymentBalance(result);
      onUpdated?.(request);
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      if (remaining > 0) {
        setAcceptedMsg(`30% deposit paid. The FTL trip can start. Remaining 70% (${money(remaining)}) is due after delivery.`);
      } else {
        setAcceptedMsg("Payment completed. Thank you!");
      }
    } catch (err) {
      setPayError(err.message);
    }
  }

  if (waitingDriver) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-semibold text-on-surface">Step 2 — waiting for driver</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Booking sent to {request.driver || "the driver"} ({request.truck || "truck"}). They will confirm
            price and estimated time. You can then accept or reject.
          </p>
        </div>
        <TripPaymentJourney compact />
      </div>
    );
  }

  if (quoteRejected) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-error/30 bg-error/5 p-4">
          <p className="text-sm font-semibold text-on-surface">Offer rejected — waiting for a new price</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            The driver can send a new price and time. You will review it again before the trip starts.
          </p>
          {request.customerDecisionNote ? (
            <p className="mt-2 text-xs text-on-surface-variant">Your note: {request.customerDecisionNote}</p>
          ) : null}
        </div>
        <TripPaymentJourney compact />
      </div>
    );
  }

  if (awaitingCustomer) {
    return (
      <>
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-on-surface">Step 3 — review price & time</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            When you accept this FTL offer, you pay the <strong>30% deposit immediately</strong> so the full-truck trip can start. The remaining 70% is after delivery.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-surface-container-lowest px-3 py-2">
              <p className="text-xs text-on-surface-variant">Agreed price</p>
              <p className="text-xl font-bold text-primary-container">
                {displayPrice != null ? money(displayPrice) : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-surface-container-lowest px-3 py-2">
              <p className="text-xs text-on-surface-variant">Estimated time</p>
              <p className="text-lg font-semibold text-on-surface">{request.quotedEstimatedTime || "—"}</p>
            </div>
          </div>
          {displayPrice != null ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-secondary-container/40 bg-secondary-container/10 px-3 py-2 text-xs">
                <span className="text-on-surface-variant">Pay now — 30% to start</span>
                <p className="text-sm font-semibold text-on-surface">{money(breakdown.deposit)}</p>
              </div>
              <div className="rounded-lg border border-outline-variant px-3 py-2 text-xs">
                <span className="text-on-surface-variant">Later — 70% after delivery</span>
                <p className="text-sm font-semibold text-on-surface">{money(breakdown.balance)}</p>
              </div>
            </div>
          ) : null}
          {request.quoteNotes ? <p className="mt-3 text-sm text-on-surface-variant">Note: {request.quoteNotes}</p> : null}
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Reject reason (optional)</span>
            <input className="stitch-input" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Too expensive, wrong ETA…" />
          </label>
          {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleAcceptAndPay}
              disabled={quotes.accept.isPending || preparePay.isPending}
            >
              <CreditCard size={16} />
              {quotes.accept.isPending || preparePay.isPending ? "Opening payment…" : `Accept & pay 30% (${money(breakdown.deposit)})`}
            </Button>
            <Button type="button" variant="danger" onClick={handleReject} disabled={quotes.reject.isPending}>
              <X size={16} /> {quotes.reject.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </div>
        </div>
        <WaafiPayModal
          payment={depositPayment}
          open={Boolean(depositPayment)}
          onClose={() => setDepositPayment(null)}
          onPay={onWaafiPay}
          loading={payWithWaafi.isPending}
          error={payError}
        />
      </>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-secondary-container/30 bg-secondary-container/10 p-4">
        <p className="text-sm font-semibold text-on-surface">Confirmed booking</p>
        {acceptedMsg ? (
          <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
            {acceptedMsg}
          </p>
        ) : (
          <p className="mt-1 text-xs text-on-surface-variant">
            Pay <strong>30%</strong> now so the trip can start. Pay <strong>70%</strong> after delivery is confirmed.
          </p>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-container-lowest px-3 py-2">
            <p className="text-xs text-on-surface-variant">Agreed price</p>
            <p className="text-xl font-bold text-primary-container">
              {displayPrice != null ? money(displayPrice) : "—"}
            </p>
          </div>
          <div className="rounded-lg bg-surface-container-lowest px-3 py-2">
            <p className="text-xs text-on-surface-variant">Estimated time</p>
            <p className="text-lg font-semibold text-on-surface">{request.quotedEstimatedTime || "—"}</p>
          </div>
        </div>
        {displayPrice != null ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-outline-variant px-3 py-2 text-xs">
              <span className="text-on-surface-variant">30% deposit to start</span>
              <p className="text-sm font-semibold text-on-surface">{money(breakdown.deposit)}</p>
            </div>
            <div className="rounded-lg border border-outline-variant px-3 py-2 text-xs">
              <span className="text-on-surface-variant">70% after delivery</span>
              <p className="text-sm font-semibold text-on-surface">{money(breakdown.balance)}</p>
            </div>
          </div>
        ) : null}
        {request.distanceKm != null ? (
          <p className="mt-3 text-sm text-on-surface-variant">Distance: {request.distanceKm} km</p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
        {canPayLater && displayPrice != null ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={handlePayDeposit} disabled={preparePay.isPending}>
              <CreditCard size={16} />
              {preparePay.isPending
                ? "Preparing…"
                : needsDeposit
                  ? `Pay 30% deposit (${money(breakdown.deposit)})`
                  : "Pay remaining 70%"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate("/customer/payments")}>
              Open payments
            </Button>
          </div>
        ) : null}
      </div>
      <WaafiPayModal
        payment={depositPayment}
        open={Boolean(depositPayment)}
        onClose={() => setDepositPayment(null)}
        onPay={onWaafiPay}
        loading={payWithWaafi.isPending}
        error={payError}
      />
    </>
  );
}
