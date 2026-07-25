import { CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/Button";
import { PriceBreakdown } from "./PriceBreakdown";
import { usePricingMutations } from "../hooks/useApi";

/** Shows auto price / ETA and payment CTA (quotations removed). */
export function QuoteReviewPanel({ request }) {
  const navigate = useNavigate();
  const pricing = usePricingMutations();

  if (!request) return null;

  const canPay = ["Assigned", "Accepted", "Arrived Pickup", "Loaded", "In Transit", "Delivered", "Approved"].includes(
    request.status
  );

  async function handlePay() {
    const result = await pricing.pay.mutateAsync(request.id);
    navigate(result.payPath || "/customer/payments");
  }

  return (
    <div className="rounded-xl border border-secondary-container/30 bg-secondary-container/10 p-4">
      <p className="text-sm font-semibold text-on-surface">Trip price & ETA</p>
      <p className="mt-1 text-xs text-on-surface-variant">
        Price and travel time are calculated automatically from distance (km). No quotation approval is required.
      </p>

      <div className="mt-4">
        <PriceBreakdown
          distanceKm={request.distanceKm}
          weight={request.weight}
          calculatedPrice={request.calculatedPrice}
          adjustmentType={request.adjustmentType}
          adjustmentAmount={request.adjustmentAmount}
          adjustmentReason={request.adjustmentReason}
          finalPrice={request.finalPrice ?? request.quotedPrice}
          quotedPrice={request.quotedPrice}
          status={request.status}
        />
      </div>

      {request.quotedEstimatedTime ? (
        <p className="mt-3 text-sm text-on-surface-variant">
          Estimated time: <strong className="text-on-surface">{request.quotedEstimatedTime}</strong>
        </p>
      ) : null}

      {canPay ? (
        <div className="mt-4">
          <Button type="button" onClick={handlePay} disabled={pricing.pay.isPending}>
            <CreditCard size={16} />
            {pricing.pay.isPending ? "Preparing…" : "Pay online"}
          </Button>
          {pricing.pay.isError ? (
            <p className="mt-2 text-sm text-error">{pricing.pay.error.message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
