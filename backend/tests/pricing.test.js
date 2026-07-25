import { describe, expect, it } from "vitest";
import {
  applyPriceAdjustment,
  calculateTransportPrice,
  estimateEtaLabel,
  parseWeightTons,
  roundMoney,
} from "../services/pricingService.js";

describe("calculateTransportPrice", () => {
  it("computes base + distance + weight and applies minimum", () => {
    const result = calculateTransportPrice({
      distanceKm: 10,
      weightTons: 2,
      baseFee: 20,
      pricePerKm: 10,
      pricePerTon: 5,
      minimumCharge: 50,
      maximumCharge: null,
    });
    // 20 + 100 + 10 = 130
    expect(result.calculatedPrice).toBe(130);
    expect(result.breakdown.distanceCharge).toBe(100);
    expect(result.breakdown.weightCharge).toBe(10);
  });

  it("raises to minimum charge when raw is lower", () => {
    const result = calculateTransportPrice({
      distanceKm: 1,
      weightTons: 0.5,
      baseFee: 20,
      pricePerKm: 10,
      pricePerTon: 5,
      minimumCharge: 50,
    });
    // 20 + 10 + 2.5 = 32.5 → min 50
    expect(result.calculatedPrice).toBe(50);
  });

  it("caps at maximum charge", () => {
    const result = calculateTransportPrice({
      distanceKm: 100,
      weightTons: 20,
      baseFee: 20,
      pricePerKm: 10,
      pricePerTon: 5,
      minimumCharge: 50,
      maximumCharge: 200,
    });
    expect(result.calculatedPrice).toBe(200);
  });
});

describe("applyPriceAdjustment", () => {
  it("increases, discounts, and sets fixed prices", () => {
    expect(applyPriceAdjustment({ calculatedPrice: 250, adjustmentType: "Increase", adjustmentAmount: 50 })).toEqual({
      calculatedPrice: 250,
      adjustmentType: "Increase",
      adjustmentAmount: 50,
      finalPrice: 300,
      changed: true,
    });
    expect(applyPriceAdjustment({ calculatedPrice: 250, adjustmentType: "Discount", adjustmentAmount: 20 })).toMatchObject({
      finalPrice: 230,
      changed: true,
    });
    expect(applyPriceAdjustment({ calculatedPrice: 250, adjustmentType: "Fixed", adjustmentAmount: 280 })).toMatchObject({
      finalPrice: 280,
      changed: true,
    });
  });

  it("marks unchanged when final equals calculated", () => {
    expect(applyPriceAdjustment({ calculatedPrice: 250, adjustmentType: null, adjustmentAmount: 0 }).changed).toBe(false);
  });
});

describe("helpers", () => {
  it("parses weight tons and rounds money", () => {
    expect(parseWeightTons("2.5 tons")).toBe(2.5);
    expect(roundMoney(10.006)).toBe(10.01);
  });
});

describe("estimateEtaLabel", () => {
  it("uses minutes for short trips", () => {
    expect(estimateEtaLabel(10)).toBe("15 minutes");
  });

  it("uses hours for same-day trips", () => {
    expect(estimateEtaLabel(80)).toBe("2 hours");
    expect(estimateEtaLabel(40)).toBe("1 hour");
  });

  it("uses days for longer trips", () => {
    expect(estimateEtaLabel(1000)).toBe("2 days");
    expect(estimateEtaLabel(960)).toBe("1 day");
  });
});
