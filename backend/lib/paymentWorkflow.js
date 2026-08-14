/**
 * Payment schedules:
 * - All Management system trips (FTL + SHARED): customer pays 100% after status is Delivered
 * - Optional fullPaymentOnce (legacy): pay full amount once before pickup
 *
 * Commission is NOT on the customer invoice — it only splits earnings
 * (driver / platform) after payment is received.
 */
export function paymentSchedule({
  amount,
  amountPaid = 0,
  deliveryConfirmedAt = null,
  tripStatus = null,
  fullPaymentOnce = false,
} = {}) {
  const total = Number(amount || 0);
  const paid = Number(amountPaid || 0);
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  const completed = paid >= total - 0.01;

  if (fullPaymentOnce) {
    return {
      depositAmount: total,
      balance,
      requiredAmount: completed ? 0 : balance,
      stage: completed ? "Completed" : "Payment Due",
      canPay: !completed && balance > 0,
      fullPaymentOnce: true,
      payAfterDelivery: false,
    };
  }

  const delivered =
    Boolean(deliveryConfirmedAt) || String(tripStatus || "") === "Delivered";

  return {
    depositAmount: 0,
    balance,
    requiredAmount: completed ? 0 : delivered ? balance : 0,
    stage: completed
      ? "Completed"
      : delivered
        ? "Payment Due"
        : "Awaiting Delivery",
    canPay: !completed && delivered && balance > 0,
    fullPaymentOnce: false,
    payAfterDelivery: true,
  };
}

/**
 * Gate for starting a trip.
 * - Default (FTL + SHARED): no prepayment — trip can start; customer pays after Delivered
 * - Legacy fullPaymentOnce: must pay 100% first
 */
export function hasStartPaymentPaid({
  amount,
  amountPaid = 0,
  fare,
  fullPaymentOnce = false,
} = {}) {
  if (!fullPaymentOnce) return true;
  const total = Number(amount != null ? amount : fare || 0);
  if (!Number.isFinite(total) || total <= 0) return false;
  const paid = Number(amountPaid || 0);
  return paid >= total - 0.01;
}

/** @deprecated Prefer hasStartPaymentPaid */
export function hasDepositPaid(args = {}) {
  return hasStartPaymentPaid({ ...args, fullPaymentOnce: false });
}
