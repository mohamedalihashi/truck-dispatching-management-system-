export function paymentSchedule({ amount, amountPaid = 0, deliveryConfirmedAt = null }) {
  const total = Number(amount || 0);
  const paid = Number(amountPaid || 0);
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  const depositAmount = Math.round(total * 0.3 * 100) / 100;
  const completed = paid >= total - 0.01;
  const depositDue = paid <= 0 && !completed;
  const deliveryConfirmed = Boolean(deliveryConfirmedAt);
  return {
    depositAmount,
    balance,
    requiredAmount: completed ? 0 : depositDue ? depositAmount : deliveryConfirmed ? balance : 0,
    stage: completed ? "Completed" : depositDue ? "Deposit Due" : deliveryConfirmed ? "Balance Due" : "Awaiting Delivery Confirmation",
    canPay: !completed && (depositDue || deliveryConfirmed),
  };
}

/** True when at least the 30% deposit has been paid for this fare/invoice. */
export function hasDepositPaid({ amount, amountPaid = 0, fare } = {}) {
  const total = Number(amount != null ? amount : fare || 0);
  if (!Number.isFinite(total) || total <= 0) return false;
  const paid = Number(amountPaid || 0);
  const depositAmount = Math.round(total * 0.3 * 100) / 100;
  return paid >= depositAmount - 0.01;
}

/** Statuses that mean the journey has started (blocked until deposit is paid). */
export const TRIP_START_STATUSES = [
  "Accepted",
  "Arrived Pickup",
  "Loaded",
  "In Transit",
  "Delayed",
  "Delivered",
];
