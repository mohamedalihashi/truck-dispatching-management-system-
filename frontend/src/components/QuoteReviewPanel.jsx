import { CreditCard } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/Button";
import { WaafiPayModal } from "./WaafiPayModal";
import { usePaymentMutations } from "../hooks/useApi";
import { money, fareAfterDelivered } from "../utils/helpers";
import { api } from "../services/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/** Customer payment panel: FTL + SHARED pay 100% after Delivered (GPS fare). */
export function QuoteReviewPanel({ request, onUpdated }) {
  const navigate = useNavigate();
  const { payWithWaafi } = usePaymentMutations();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [checkoutPayment, setCheckoutPayment] = useState(null);
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

  const isShared = request.loadType === "SHARED";
  const awaitingAdmin =
    ["Pending", "Awaiting Approval", "Quote Rejected"].includes(request.status) && !request.driverId;
  const awaitingCustomer = request.status === "Awaiting Approval" && Boolean(request.driverId);
  const quoteRejected = request.status === "Quote Rejected";
  const displayPrice = request.quotedPrice ?? request.finalPrice ?? request.calculatedPrice;
  const tripDelivered = ["Delivered"].includes(request.status);
  const canPayFtl = tripDelivered;
  const canPayShared = isShared && tripDelivered;
  const showPayButton = isShared ? canPayShared : canPayFtl;
  const fareLabel = fareAfterDelivered(request.status, displayPrice);

  async function openCheckout(requestId) {
    const result = await preparePay.mutateAsync(requestId);
    setCheckoutPayment(result.payment);
    setPayError("");
    return result.payment;
  }

  async function handlePay() {
    setError("");
    try {
      await openCheckout(request.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onWaafiPay(payload) {
    setPayError("");
    try {
      await payWithWaafi.mutateAsync(payload);
      setCheckoutPayment(null);
      onUpdated?.(request);
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setAcceptedMsg("Payment completed. Thank you!");
    } catch (err) {
      setPayError(err.message);
    }
  }

  if (awaitingAdmin && !isShared) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-semibold text-on-surface">Waiting for admin assignment</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Your request is in the queue. An admin will assign a driver and truck — you pay{" "}
            <strong>100%</strong> after the trip is Delivered.
          </p>
        </div>
      </div>
    );
  }

  if (awaitingCustomer && !isShared) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <p className="text-sm font-semibold text-on-surface">Assignment in progress</p>
        <p className="mt-1 text-xs text-on-surface-variant">
          An admin is confirming the price and driver assignment. Payment is due only after Delivered
          (100% of the trip fare).
        </p>
      </div>
    );
  }

  if (isShared) {
    return (
      <>
        <div className="rounded-xl border border-secondary-container/30 bg-secondary-container/10 p-4">
          <p className="text-sm font-semibold text-on-surface">Shared booking</p>
          {acceptedMsg ? (
            <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
              {acceptedMsg}
            </p>
          ) : (
            <p className="mt-1 text-xs text-on-surface-variant">
              Pay the <strong>full fare once</strong> after status is <strong>Delivered</strong> (GPS km + weight).
            </p>
          )}
          <div className="mt-4 rounded-lg bg-surface-container-lowest px-3 py-2">
            <p className="text-xs text-on-surface-variant">Fare</p>
            <p className="text-xl font-bold text-primary-container">
              {fareLabel}
            </p>
          </div>
          {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
          {showPayButton && displayPrice != null && Number(displayPrice) > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={handlePay} disabled={preparePay.isPending}>
                <CreditCard size={16} />
                {preparePay.isPending ? "Preparing…" : `Pay full fare (${money(displayPrice)})`}
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate("/customer/payments")}>
                Open payments
              </Button>
            </div>
          ) : null}
        </div>
        <WaafiPayModal
          payment={checkoutPayment}
          open={Boolean(checkoutPayment)}
          onClose={() => setCheckoutPayment(null)}
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
            Pay <strong>100%</strong> of the trip fare after the status is <strong>Delivered</strong>. No
            deposit before the trip.
          </p>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-container-lowest px-3 py-2">
            <p className="text-xs text-on-surface-variant">Agreed price</p>
            <p className="text-xl font-bold text-primary-container">
              {fareLabel}
            </p>
          </div>
          <div className="rounded-lg bg-surface-container-lowest px-3 py-2">
            <p className="text-xs text-on-surface-variant">Estimated time</p>
            <p className="text-lg font-semibold text-on-surface">{request.quotedEstimatedTime || "—"}</p>
          </div>
        </div>
        {tripDelivered && displayPrice != null && Number(displayPrice) > 0 ? (
          <div className="mt-3 rounded-lg border border-outline-variant px-3 py-2 text-xs">
            <span className="text-on-surface-variant">Due after Delivered</span>
            <p className="text-sm font-semibold text-on-surface">{money(displayPrice)} (100%)</p>
          </div>
        ) : null}
        {tripDelivered && request.distanceKm != null ? (
          <p className="mt-3 text-sm text-on-surface-variant">Distance: {request.distanceKm} km</p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
        {showPayButton && displayPrice != null && Number(displayPrice) > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={handlePay} disabled={preparePay.isPending}>
              <CreditCard size={16} />
              {preparePay.isPending ? "Preparing…" : `Pay 100% (${money(displayPrice)})`}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate("/customer/payments")}>
              Open payments
            </Button>
          </div>
        ) : !tripDelivered ? (
          <p className="mt-4 text-xs text-on-surface-variant">
            Payment unlocks when the trip status is Delivered.
          </p>
        ) : null}
      </div>
      <WaafiPayModal
        payment={checkoutPayment}
        open={Boolean(checkoutPayment)}
        onClose={() => setCheckoutPayment(null)}
        onPay={onWaafiPay}
        loading={payWithWaafi.isPending}
        error={payError}
      />
    </>
  );
}
