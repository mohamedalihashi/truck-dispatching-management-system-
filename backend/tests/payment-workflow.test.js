import { describe, expect, it } from "vitest";
import { hasDepositPaid, hasStartPaymentPaid, paymentSchedule } from "../lib/paymentWorkflow.js";

describe("FTL pay 100% after Delivered", () => {
  it("locks payment until Delivered", () => {
    expect(paymentSchedule({ amount: 1000 })).toEqual({
      depositAmount: 0,
      balance: 1000,
      requiredAmount: 0,
      stage: "Awaiting Delivery",
      canPay: false,
      fullPaymentOnce: false,
      payAfterDelivery: true,
    });
  });

  it("keeps payment locked while In Transit", () => {
    expect(paymentSchedule({ amount: 1000, tripStatus: "In Transit" })).toMatchObject({
      requiredAmount: 0,
      stage: "Awaiting Delivery",
      canPay: false,
    });
  });

  it("requires full fare when trip is Delivered", () => {
    expect(paymentSchedule({ amount: 1000, tripStatus: "Delivered" })).toMatchObject({
      depositAmount: 0,
      balance: 1000,
      requiredAmount: 1000,
      stage: "Payment Due",
      canPay: true,
      payAfterDelivery: true,
    });
  });

  it("also unlocks after delivery confirmation date", () => {
    expect(
      paymentSchedule({ amount: 1000, deliveryConfirmedAt: new Date() })
    ).toMatchObject({
      requiredAmount: 1000,
      stage: "Payment Due",
      canPay: true,
    });
  });

  it("marks completed when fully paid", () => {
    expect(
      paymentSchedule({ amount: 1000, amountPaid: 1000, tripStatus: "Delivered" })
    ).toMatchObject({
      requiredAmount: 0,
      stage: "Completed",
      canPay: false,
    });
  });

  it("treats near-full payment as completed (float tolerance)", () => {
    expect(paymentSchedule({ amount: 100, amountPaid: 99.995, tripStatus: "Delivered" })).toMatchObject({
      requiredAmount: 0,
      stage: "Completed",
      canPay: false,
    });
  });

  it("requires remaining balance only (no partial deposit stages)", () => {
    expect(
      paymentSchedule({ amount: 1000, amountPaid: 200, tripStatus: "Delivered" })
    ).toMatchObject({
      requiredAmount: 800,
      canPay: true,
      stage: "Payment Due",
    });
  });
});

describe("hasStartPaymentPaid (trip start gate)", () => {
  it("allows FTL start with no prepayment", () => {
    expect(hasStartPaymentPaid({ amount: 1000, amountPaid: 0 })).toBe(true);
    expect(hasDepositPaid({ amount: 1000, amountPaid: 0 })).toBe(true);
  });

  it("requires 100% before shared pickup", () => {
    expect(hasStartPaymentPaid({ amount: 1000, amountPaid: 300, fullPaymentOnce: true })).toBe(false);
    expect(hasStartPaymentPaid({ amount: 1000, amountPaid: 1000, fullPaymentOnce: true })).toBe(true);
  });
});

describe("shared full payment once", () => {
  it("requires full payment once for shared trips", () => {
    expect(paymentSchedule({ amount: 1000, fullPaymentOnce: true })).toEqual({
      depositAmount: 1000,
      balance: 1000,
      requiredAmount: 1000,
      stage: "Payment Due",
      canPay: true,
      fullPaymentOnce: true,
      payAfterDelivery: false,
    });
    expect(paymentSchedule({ amount: 1000, amountPaid: 1000, fullPaymentOnce: true })).toMatchObject({
      requiredAmount: 0,
      stage: "Completed",
      canPay: false,
    });
  });
});
