import { describe, expect, it } from "vitest";
import { hasDepositPaid, paymentSchedule } from "../lib/paymentWorkflow.js";

describe("30/70 cargo payment workflow", () => {
  it("requires exactly 30% before trip confirmation", () => {
    expect(paymentSchedule({ amount: 1000 })).toEqual({
      depositAmount: 300,
      balance: 1000,
      requiredAmount: 300,
      stage: "Deposit Due",
      canPay: true,
    });
  });

  it("locks the remaining 70% until delivery confirmation", () => {
    expect(paymentSchedule({ amount: 1000, amountPaid: 300 })).toMatchObject({
      balance: 700,
      requiredAmount: 0,
      stage: "Awaiting Delivery Confirmation",
      canPay: false,
    });
  });

  it("releases the 70% after confirmation and closes at full payment", () => {
    expect(paymentSchedule({ amount: 1000, amountPaid: 300, deliveryConfirmedAt: new Date() })).toMatchObject({
      requiredAmount: 700,
      stage: "Balance Due",
      canPay: true,
    });
    expect(paymentSchedule({ amount: 1000, amountPaid: 1000, deliveryConfirmedAt: new Date() })).toMatchObject({
      requiredAmount: 0,
      stage: "Completed",
      canPay: false,
    });
  });

  it("rounds deposit to cents for odd totals", () => {
    expect(paymentSchedule({ amount: 999 })).toMatchObject({
      depositAmount: 299.7,
      requiredAmount: 299.7,
      stage: "Deposit Due",
      canPay: true,
    });
  });

  it("treats near-full payment as completed (float tolerance)", () => {
    expect(paymentSchedule({ amount: 100, amountPaid: 99.995 })).toMatchObject({
      requiredAmount: 0,
      stage: "Completed",
      canPay: false,
    });
  });

  it("keeps balance locked when deposit paid without confirmation date", () => {
    const schedule = paymentSchedule({ amount: 500, amountPaid: 150 });
    expect(schedule.canPay).toBe(false);
    expect(schedule.requiredAmount).toBe(0);
    expect(schedule.stage).toBe("Awaiting Delivery Confirmation");
  });
});

describe("hasDepositPaid (trip start gate)", () => {
  it("blocks start when nothing is paid", () => {
    expect(hasDepositPaid({ amount: 1000, amountPaid: 0 })).toBe(false);
  });

  it("allows start when 30% deposit is paid", () => {
    expect(hasDepositPaid({ amount: 1000, amountPaid: 300 })).toBe(true);
  });

  it("falls back to fare when invoice amount is missing", () => {
    expect(hasDepositPaid({ fare: 200, amountPaid: 60 })).toBe(true);
    expect(hasDepositPaid({ fare: 200, amountPaid: 59 })).toBe(false);
  });
});
