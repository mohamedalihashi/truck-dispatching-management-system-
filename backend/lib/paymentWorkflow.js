/**
 * Payment schedules:
 * - FTL (default): 30% deposit before start, 70% after delivery confirmation
 * - Shared (fullPaymentOnce): customer pays the full amount once before pickup
 */
export function paymentSchedule({
  amount,
  amountPaid = 0,
  deliveryConfirmedAt = null,
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
    };
  }

  const depositAmount = Math.round(total * 0.3 * 100) / 100;
  const depositDue = paid <= 0 && !completed;
  const deliveryConfirmed = Boolean(deliveryConfirmedAt);
  return {
    depositAmount,
    balance,
    requiredAmount: completed ? 0 : depositDue ? depositAmount : deliveryConfirmed ? balance : 0,
    stage: completed
      ? "Completed"
      : depositDue
        ? "Deposit Due"
        : deliveryConfirmed
          ? "Balance Due"
          : "Awaiting Delivery Confirmation",
    canPay: !completed && (depositDue || deliveryConfirmed),
    fullPaymentOnce: false,
  };
}

/** True when enough has been paid to start the trip (30% for FTL, 100% for shared). */
export function hasStartPaymentPaid({
  amount,
  amountPaid = 0,
  fare,
  fullPaymentOnce = false,
} = {}) {
  const total = Number(amount != null ? amount : fare || 0);
  if (!Number.isFinite(total) || total <= 0) return false;
  const paid = Number(amountPaid || 0);
  if (fullPaymentOnce) return paid >= total - 0.01;
  const depositAmount = Math.round(total * 0.3 * 100) / 100;
  return paid >= depositAmount - 0.01;
}

/** @deprecated Prefer hasStartPaymentPaid — FTL 30% gate */
export function hasDepositPaid(args = {}) {
  return hasStartPaymentPaid({ ...args, fullPaymentOnce: false });
}

/** Statuses that mean the journey has started (blocked until start payment is paid). */
export const TRIP_START_STATUSES = [
  "Accepted",
  "Arrived Pickup",
  "Loaded",
  "In Transit",
  "Delayed",
  "Delivered",
];
