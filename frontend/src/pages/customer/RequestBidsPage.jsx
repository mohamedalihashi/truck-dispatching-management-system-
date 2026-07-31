import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { WaafiPayModal } from "../../components/WaafiPayModal";
import { usePaymentMutations } from "../../hooks/useApi";
import { api } from "../../services/api";
import { money, paymentBalance } from "../../utils/helpers";
import { paymentBreakdown } from "../../components/TripPaymentJourney";

export function RequestBidsPage() {
  const { cargoRequestId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { payWithWaafi } = usePaymentMutations();
  const [error, setError] = useState("");
  const [depositPayment, setDepositPayment] = useState(null);
  const [payError, setPayError] = useState("");
  const [message, setMessage] = useState("");

  const { data: bids, isLoading } = useQuery({
    queryKey: ["bids-request", cargoRequestId],
    queryFn: () => api.listBidsForRequest(cargoRequestId),
    enabled: Boolean(cargoRequestId)
  });

  const acceptBid = useMutation({
    mutationFn: (bidId) => api.acceptBid(bidId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargo-requests"] });
      qc.invalidateQueries({ queryKey: ["bids-request", cargoRequestId] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["trips"] });
    }
  });

  const rows = bids?.data || [];

  async function handleAccept(bid) {
    const deposit = paymentBreakdown(bid.amount).deposit;
    if (!confirm(`Accept this bid and pay 30% deposit (${money(deposit)}) now so the trip can start?`)) return;
    setError("");
    setMessage("");
    try {
      await acceptBid.mutateAsync(bid.id);
      const pay = await api.payQuote(cargoRequestId);
      setDepositPayment(pay.payment);
      setPayError("");
      setMessage("Bid accepted. Pay the 30% deposit now so the trip can start.");
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
      setMessage(
        remaining > 0
          ? `30% deposit paid. The trip can start. Remaining 70% (${money(remaining)}) is due after delivery.`
          : "Payment completed. Thank you!"
      );
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["trips"] });
    } catch (err) {
      setPayError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bids for ${cargoRequestId}`}
        subtitle="Accept a bid, then pay 30% deposit immediately so the trip can start."
        actions={
          <Link to="/customer/trips">
            <Button variant="secondary">Back to trips</Button>
          </Link>
        }
      />

      {error ? <p className="text-sm text-error">{error}</p> : null}
      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          {message}
        </p>
      ) : null}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-on-surface-variant">Loading bids…</p>
      ) : !rows.length ? (
        <p className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant">
          No bids yet. Drivers on the marketplace will submit offers soon.
        </p>
      ) : (
        <div className="grid gap-4">
          {rows.map((bid) => {
            const deposit = paymentBreakdown(bid.amount).deposit;
            return (
              <article key={bid.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-on-surface">{bid.driver || "Driver"}</p>
                    <p className="text-sm text-on-surface-variant">{bid.truck || "Truck"} · {bid.driverPhone || ""}</p>
                    {bid.notes ? <p className="mt-2 text-sm text-on-surface-variant">Note: {bid.notes}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary-container">{money(bid.amount)}</p>
                    <p className="text-sm text-on-surface-variant">{bid.estimatedDays ? `${bid.estimatedDays} day(s)` : "—"}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">30% now: {money(deposit)}</p>
                    <StatusBadge status={bid.status} />
                  </div>
                </div>
                {bid.status === "Pending" ? (
                  <div className="mt-4">
                    <Button onClick={() => handleAccept(bid)} disabled={acceptBid.isPending}>
                      <CreditCard size={16} />
                      {acceptBid.isPending ? "Opening payment…" : `Accept & pay 30% (${money(deposit)})`}
                    </Button>
                  </div>
                ) : bid.status === "Accepted" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => navigate("/customer/payments")}>
                      <Check size={16} /> Open payments
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <WaafiPayModal
        payment={depositPayment}
        open={Boolean(depositPayment)}
        onClose={() => setDepositPayment(null)}
        onPay={onWaafiPay}
        loading={payWithWaafi.isPending}
        error={payError}
      />
    </div>
  );
}

export default function RequestBidsRoutePage() {
  return <RequestBidsPage />;
}
