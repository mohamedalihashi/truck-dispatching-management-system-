import { describe, expect, it } from "vitest";
import {
  formatMeasuredQuantity,
  parseLegacyQuantity,
  resolveCargoMeasurement,
  resolveLivestockKind,
  weightInputToKg,
} from "../lib/cargoMeasurement.js";
import {
  calculateDeliveryFare,
  calculateFareFromRates,
  normalizePricingInput,
} from "../services/pricingRates.js";

describe("resolveCargoMeasurement", () => {
  it("maps fuel to liters", () => {
    expect(resolveCargoMeasurement("Fuel & oil").unit).toBe("LITER");
  });

  it("maps water to liters", () => {
    expect(resolveCargoMeasurement("Water").unit).toBe("LITER");
  });

  it("maps livestock kinds to head with distinct pricing keys", () => {
    expect(resolveCargoMeasurement("Livestock — Geel (Camels)").unit).toBe("HEAD");
    expect(resolveCargoMeasurement("Livestock — Geel (Camels)").pricingKey).toBe("camel");
    expect(resolveCargoMeasurement("Livestock — Ari (Sheep)").pricingKey).toBe("sheep");
    expect(resolveCargoMeasurement("Livestock — Lo' (Goats)").pricingKey).toBe("goat");
    expect(resolveCargoMeasurement("Livestock").unit).toBe("HEAD");
  });

  it("maps general goods and construction to kg", () => {
    expect(resolveCargoMeasurement("General goods").unit).toBe("KG");
    expect(resolveCargoMeasurement("Construction materials").unit).toBe("KG");
  });

  it("Others free-text keeps unitChoice (does not treat 'ari' in description as sheep)", () => {
    const others = resolveCargoMeasurement("Others — baris baaato yanyo ari");
    expect(others.unitChoice).toBe(true);
    const free = resolveCargoMeasurement("baris baaato yanyo ari");
    expect(free.unitChoice).toBe(true);
  });

  it("resolvePickupMeasurements accepts mixed kg + liter + head", async () => {
    const { resolvePickupMeasurements, parseMeasurementParts } = await import(
      "../lib/cargoMeasurement.js"
    );
    const resolved = resolvePickupMeasurements(
      { measurements: { kg: 10, liter: 2, head: 4 } },
      "Others — baris"
    );
    expect(resolved.ok).toBe(true);
    expect(resolved.measurementUnit).toBe("MIXED");
    expect(resolved.weightLabel).toContain("10 kg");
    expect(resolved.weightLabel).toContain("2 liters");
    expect(resolved.weightLabel).toContain("4 head");
    const parts = parseMeasurementParts(resolved.weightLabel, "MIXED");
    expect(parts).toHaveLength(3);
  });
});

describe("resolveLivestockKind", () => {
  it("detects geel, ari, and lo'", () => {
    expect(resolveLivestockKind("Livestock — Geel (Camels)")?.id).toBe("camel");
    expect(resolveLivestockKind("Livestock — Ari (Sheep)")?.id).toBe("sheep");
    expect(resolveLivestockKind("Livestock — Lo' (Goats)")?.id).toBe("goat");
  });
});

describe("formatMeasuredQuantity", () => {
  it("formats liters and livestock kinds", () => {
    expect(formatMeasuredQuantity(5000, "LITER")).toBe("5000 liters");
    expect(formatMeasuredQuantity(10, "HEAD", "Livestock — Geel (Camels)")).toBe(
      "10 Geel (Camels)"
    );
    expect(formatMeasuredQuantity(35, "HEAD", "Livestock — Ari (Sheep)")).toBe("35 Ari (Sheep)");
    expect(formatMeasuredQuantity(25, "HEAD", "Livestock — Lo' (Goats)")).toBe("25 Lo' (Goats)");
  });

  it("shows large kg as tons", () => {
    expect(formatMeasuredQuantity(850, "KG")).toBe("850 kg");
    expect(formatMeasuredQuantity(12000, "KG")).toBe("12 tons");
  });
});

describe("weightInputToKg", () => {
  it("converts tons input to kg", () => {
    expect(weightInputToKg(12, "tons")).toBe(12000);
    expect(weightInputToKg(850, "kg")).toBe(850);
  });
});

describe("parseLegacyQuantity", () => {
  it("parses kg and tons into kg", () => {
    expect(parseLegacyQuantity("800 kg", "KG")).toBe(800);
    expect(parseLegacyQuantity("12 tons", "KG")).toBe(12000);
  });
});

describe("calculateDeliveryFare", () => {
  const pricing = normalizePricingInput({
    enabled: true,
    ftlPricePerKg: 0.05,
    ftlPricePerKm: 1.5,
    ftlPricePerLiter: 0.01,
    ftlPricePerCamel: 15,
    ftlPricePerSheep: 3,
    ftlPricePerGoat: 2,
    ftlKgEnabled: true,
    ftlKmEnabled: true,
    ftlLiterEnabled: true,
    ftlCamelEnabled: true,
    ftlSheepEnabled: true,
    ftlGoatEnabled: true,
  });

  it("general cargo: distance + kg charge", () => {
    const fare = calculateDeliveryFare(
      {
        cargoType: "General goods",
        measuredQuantity: 800,
        measurementUnit: "KG",
        loadType: "FTL",
        traveledKm: 100,
      },
      pricing
    );
    expect(fare).toBe(190);
  });

  it("construction uses kg rate (12 tons = 12000 kg)", () => {
    const fare = calculateDeliveryFare(
      {
        cargoType: "Construction materials",
        measuredQuantity: 12000,
        measurementUnit: "KG",
        loadType: "FTL",
        traveledKm: 50,
      },
      pricing
    );
    expect(fare).toBe(675);
  });

  it("water: distance + liter charge", () => {
    const fare = calculateDeliveryFare(
      {
        cargoType: "Water",
        measuredQuantity: 5000,
        measurementUnit: "LITER",
        loadType: "FTL",
        traveledKm: 10,
      },
      pricing
    );
    expect(fare).toBe(65);
  });

  it("geel: distance + camel rate", () => {
    const fare = calculateDeliveryFare(
      {
        cargoType: "Livestock — Geel (Camels)",
        measuredQuantity: 10,
        measurementUnit: "HEAD",
        loadType: "FTL",
        traveledKm: 100,
      },
      pricing
    );
    expect(fare).toBe(300);
  });

  it("ari: distance + sheep rate", () => {
    const fare = calculateDeliveryFare(
      {
        cargoType: "Livestock — Ari (Sheep)",
        measuredQuantity: 30,
        measurementUnit: "HEAD",
        loadType: "FTL",
        traveledKm: 100,
      },
      pricing
    );
    expect(fare).toBe(240);
  });

  it("lo': distance + goat rate", () => {
    const fare = calculateDeliveryFare(
      {
        cargoType: "Livestock — Lo' (Goats)",
        measuredQuantity: 25,
        measurementUnit: "HEAD",
        loadType: "FTL",
        traveledKm: 100,
      },
      pricing
    );
    expect(fare).toBe(200);
  });
});

describe("calculateFareFromRates (legacy kg path)", () => {
  it("still supports kg + km", () => {
    const pricing = normalizePricingInput({
      enabled: true,
      ftlPricePerKg: 1,
      ftlPricePerKm: 0.5,
      ftlKgEnabled: true,
      ftlKmEnabled: true,
    });
    expect(calculateFareFromRates("1000 kg", "FTL", pricing, 20)).toBe(1010);
  });
});
