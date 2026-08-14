import { prisma } from "../lib/prisma.js";
import { estimateDistanceKm } from "./pricingService.js";
import {
  parseLegacyQuantity,
  resolveCargoMeasurement,
  cargoPricingKey,
} from "../lib/cargoMeasurement.js";

/** Admin-configured rates (Settings → Pricing). */
export const DEFAULT_PRICING = {
  enabled: true,
  ftlPricePerKg: 1,
  sharedPricePerKg: 1,
  ftlPricePerKm: 0,
  sharedPricePerKm: 0,
  ftlPricePerLiter: 0.01,
  sharedPricePerLiter: 0.01,
  ftlPricePerCamel: 15,
  sharedPricePerCamel: 15,
  ftlPricePerSheep: 3,
  sharedPricePerSheep: 3,
  ftlPricePerGoat: 2,
  sharedPricePerGoat: 2,
};

/**
 * Normalize pricing. Migrates legacy `*PricePerTon` → `*PricePerKg` (/1000).
 */
export function normalizePricingInput(value = {}) {
  const enabled = value.enabled === false ? false : true;

  let ftlKg = Number(value.ftlPricePerKg);
  if (!Number.isFinite(ftlKg) || ftlKg < 0) {
    const legacy = Number(value.ftlPricePerTon);
    ftlKg = Number.isFinite(legacy) && legacy >= 0 ? legacy / 1000 : DEFAULT_PRICING.ftlPricePerKg;
  }

  let sharedKg = Number(value.sharedPricePerKg);
  if (!Number.isFinite(sharedKg) || sharedKg < 0) {
    const legacy = Number(value.sharedPricePerTon);
    sharedKg =
      Number.isFinite(legacy) && legacy >= 0 ? legacy / 1000 : DEFAULT_PRICING.sharedPricePerKg;
  }

  const ftlKm = Number(value.ftlPricePerKm);
  const sharedKm = Number(value.sharedPricePerKm);

  const ftlKgRate = Math.round(ftlKg * 10000) / 10000;
  const sharedKgRate = Math.round(sharedKg * 10000) / 10000;
  const ftlKmRate =
    Number.isFinite(ftlKm) && ftlKm >= 0 ? Math.round(ftlKm * 10000) / 10000 : DEFAULT_PRICING.ftlPricePerKm;
  const sharedKmRate =
    Number.isFinite(sharedKm) && sharedKm >= 0
      ? Math.round(sharedKm * 10000) / 10000
      : DEFAULT_PRICING.sharedPricePerKm;

  const num = (key, fallback) => {
    const v = Number(value[key]);
    return Number.isFinite(v) && v >= 0 ? Math.round(v * 10000) / 10000 : fallback;
  };

  const ftlLiter = num("ftlPricePerLiter", DEFAULT_PRICING.ftlPricePerLiter);
  const sharedLiter = num("sharedPricePerLiter", DEFAULT_PRICING.sharedPricePerLiter);

  let ftlCamel = num("ftlPricePerCamel", DEFAULT_PRICING.ftlPricePerCamel);
  let sharedCamel = num("sharedPricePerCamel", DEFAULT_PRICING.sharedPricePerCamel);
  let ftlSheep = num("ftlPricePerSheep", DEFAULT_PRICING.ftlPricePerSheep);
  let sharedSheep = num("sharedPricePerSheep", DEFAULT_PRICING.sharedPricePerSheep);
  let ftlGoat = num("ftlPricePerGoat", DEFAULT_PRICING.ftlPricePerGoat);
  let sharedGoat = num("sharedPricePerGoat", DEFAULT_PRICING.sharedPricePerGoat);

  const legacyHead = Number(value.ftlPricePerHead);
  if (Number.isFinite(legacyHead) && legacyHead >= 0) {
    if (!value.ftlPricePerCamel) ftlCamel = legacyHead * 5;
    if (!value.ftlPricePerSheep) ftlSheep = legacyHead;
    if (!value.ftlPricePerGoat) ftlGoat = legacyHead * 0.67;
  }
  const legacySharedHead = Number(value.sharedPricePerHead);
  if (Number.isFinite(legacySharedHead) && legacySharedHead >= 0) {
    if (!value.sharedPricePerCamel) sharedCamel = legacySharedHead * 5;
    if (!value.sharedPricePerSheep) sharedSheep = legacySharedHead;
    if (!value.sharedPricePerGoat) sharedGoat = legacySharedHead * 0.67;
  }

  const ftlKgEnabled =
    value.ftlKgEnabled != null ? Boolean(value.ftlKgEnabled) : ftlKgRate > 0;
  const ftlKmEnabled =
    value.ftlKmEnabled != null ? Boolean(value.ftlKmEnabled) : ftlKmRate > 0;
  const sharedKgEnabled =
    value.sharedKgEnabled != null ? Boolean(value.sharedKgEnabled) : sharedKgRate > 0;
  const sharedKmEnabled =
    value.sharedKmEnabled != null ? Boolean(value.sharedKmEnabled) : sharedKmRate > 0;
  const ftlLiterEnabled =
    value.ftlLiterEnabled != null ? Boolean(value.ftlLiterEnabled) : ftlLiter > 0;
  const sharedLiterEnabled =
    value.sharedLiterEnabled != null ? Boolean(value.sharedLiterEnabled) : sharedLiter > 0;
  const ftlCamelEnabled =
    value.ftlCamelEnabled != null ? Boolean(value.ftlCamelEnabled) : ftlCamel > 0;
  const sharedCamelEnabled =
    value.sharedCamelEnabled != null ? Boolean(value.sharedCamelEnabled) : sharedCamel > 0;
  const ftlSheepEnabled =
    value.ftlSheepEnabled != null ? Boolean(value.ftlSheepEnabled) : ftlSheep > 0;
  const sharedSheepEnabled =
    value.sharedSheepEnabled != null ? Boolean(value.sharedSheepEnabled) : sharedSheep > 0;
  const ftlGoatEnabled =
    value.ftlGoatEnabled != null ? Boolean(value.ftlGoatEnabled) : ftlGoat > 0;
  const sharedGoatEnabled =
    value.sharedGoatEnabled != null ? Boolean(value.sharedGoatEnabled) : sharedGoat > 0;

  return {
    enabled,
    ftlPricePerKg: ftlKgRate,
    sharedPricePerKg: sharedKgRate,
    ftlPricePerKm: ftlKmRate,
    sharedPricePerKm: sharedKmRate,
    ftlPricePerLiter: ftlLiter,
    sharedPricePerLiter: sharedLiter,
    ftlPricePerCamel: ftlCamel,
    sharedPricePerCamel: sharedCamel,
    ftlPricePerSheep: ftlSheep,
    sharedPricePerSheep: sharedSheep,
    ftlPricePerGoat: ftlGoat,
    sharedPricePerGoat: sharedGoat,
    ftlKgEnabled,
    ftlKmEnabled,
    sharedKgEnabled,
    sharedKmEnabled,
    ftlLiterEnabled,
    sharedLiterEnabled,
    ftlCamelEnabled,
    sharedCamelEnabled,
    ftlSheepEnabled,
    sharedSheepEnabled,
    ftlGoatEnabled,
    sharedGoatEnabled,
  };
}

function effectivePricingRate(pricing, loadType, kind) {
  const isShared = String(loadType || "").toUpperCase() === "SHARED";
  const map = {
    kg: isShared
      ? { enabled: pricing.sharedKgEnabled, rate: pricing.sharedPricePerKg }
      : { enabled: pricing.ftlKgEnabled, rate: pricing.ftlPricePerKg },
    km: isShared
      ? { enabled: pricing.sharedKmEnabled, rate: pricing.sharedPricePerKm }
      : { enabled: pricing.ftlKmEnabled, rate: pricing.ftlPricePerKm },
    liter: isShared
      ? { enabled: pricing.sharedLiterEnabled, rate: pricing.sharedPricePerLiter }
      : { enabled: pricing.ftlLiterEnabled, rate: pricing.ftlPricePerLiter },
    camel: isShared
      ? { enabled: pricing.sharedCamelEnabled, rate: pricing.sharedPricePerCamel }
      : { enabled: pricing.ftlCamelEnabled, rate: pricing.ftlPricePerCamel },
    sheep: isShared
      ? { enabled: pricing.sharedSheepEnabled, rate: pricing.sharedPricePerSheep }
      : { enabled: pricing.ftlSheepEnabled, rate: pricing.ftlPricePerSheep },
    goat: isShared
      ? { enabled: pricing.sharedGoatEnabled, rate: pricing.sharedPricePerGoat }
      : { enabled: pricing.ftlGoatEnabled, rate: pricing.ftlPricePerGoat },
    head: isShared
      ? { enabled: pricing.sharedSheepEnabled, rate: pricing.sharedPricePerSheep }
      : { enabled: pricing.ftlSheepEnabled, rate: pricing.ftlPricePerSheep },
  };
  const entry = map[kind] || map.kg;
  const rate = Number(entry.rate);
  if (entry.enabled === false) return 0;
  if (entry.enabled == null && !(rate > 0)) return 0;
  return Number.isFinite(rate) && rate >= 0 ? rate : 0;
}

export async function getPricingSettings() {
  const row = await prisma.setting.findUnique({ where: { key: "pricing" } });
  return normalizePricingInput(row?.value && typeof row.value === "object" ? row.value : {});
}

/** Parse cargo weight to kilograms. Bare numbers default to kg; "ton(s)" → ×1000. */
export function parseWeightKg(weight) {
  const raw = String(weight || "").trim().toLowerCase();
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (/\btons?\b/.test(raw) || raw.includes("tonne")) return n * 1000;
  return n;
}

/** Fare = (kg × pricePerKg) + (distanceKm × pricePerKm). Legacy helper. */
export function calculateFareFromRates(
  weight,
  loadType = "FTL",
  pricing = DEFAULT_PRICING,
  distanceKm = 0
) {
  if (!pricing || pricing.enabled === false) return null;
  const kg = parseWeightKg(weight);
  if (!(kg > 0)) return null;
  const rateKg = effectivePricingRate(pricing, loadType, "kg");
  const rateKm = effectivePricingRate(pricing, loadType, "km");
  const km = Number(distanceKm);
  const weightPart = rateKg > 0 ? kg * rateKg : 0;
  const distancePart = rateKm > 0 && Number.isFinite(km) && km > 0 ? km * rateKm : 0;
  const total = weightPart + distancePart;
  if (!(total > 0)) return null;
  return Math.round(total * 100) / 100;
}

/** Final fare at delivery = distance charge + cargo charge (by measurement unit). */
export function calculateDeliveryFare(
  {
    cargoType,
    measuredQuantity,
    measurementUnit,
    weight,
    loadType = "FTL",
    traveledKm = 0,
    routeDistanceKm = null,
  },
  pricing = DEFAULT_PRICING
) {
  if (!pricing || pricing.enabled === false) return null;

  const config = resolveCargoMeasurement(cargoType);
  const unit = String(measurementUnit || config.unit || "KG").toUpperCase();
  let quantity = measuredQuantity != null ? Number(measuredQuantity) : 0;
  if (!(quantity > 0) && weight) {
    quantity = parseLegacyQuantity(weight, unit);
    if (!(quantity > 0) && unit === "KG") {
      quantity = parseWeightKg(weight);
    }
  }
  if (!(quantity > 0)) return null;

  const gpsKm = Number(traveledKm);
  const routeKm = routeDistanceKm != null ? Number(routeDistanceKm) : null;
  const km =
    Number.isFinite(gpsKm) && gpsKm > 0
      ? gpsKm
      : Number.isFinite(routeKm) && routeKm > 0
        ? routeKm
        : 0;

  const rateKm = effectivePricingRate(pricing, loadType, "km");
  const distanceCharge = rateKm > 0 && km > 0 ? km * rateKm : 0;

  let cargoRate = 0;
  const priceKey = cargoPricingKey(cargoType, unit);
  if (unit === "LITER") cargoRate = effectivePricingRate(pricing, loadType, "liter");
  else if (unit === "HEAD") cargoRate = effectivePricingRate(pricing, loadType, priceKey);
  else cargoRate = effectivePricingRate(pricing, loadType, "kg");

  const cargoCharge = cargoRate > 0 ? quantity * cargoRate : 0;
  const total = distanceCharge + cargoCharge;
  if (!(total > 0)) return null;
  return Math.round(total * 100) / 100;
}

/**
 * Estimate fare using admin rates + optional route distance from pickup/destination.
 */
export async function estimateFare(weight, loadType = "FTL", route = null) {
  const pricing = await getPricingSettings();
  let distanceKm = route?.distanceKm != null ? Number(route.distanceKm) : null;
  if (
    (distanceKm == null || !Number.isFinite(distanceKm)) &&
    route?.pickup &&
    route?.destination
  ) {
    distanceKm = estimateDistanceKm(route.pickup, route.destination, {
      fromRegion: route.fromRegion,
      fromDistrict: route.fromDistrict,
      toRegion: route.toRegion,
      toDistrict: route.toDistrict,
    });
  }
  return calculateFareFromRates(weight, loadType, pricing, distanceKm || 0);
}

/** Fare using actual GPS-traveled km + pickup measurement (for billing at delivery). */
export async function fareFromTraveledKm(
  weight,
  loadType = "FTL",
  traveledKm = 0,
  { cargoType, measuredQuantity, measurementUnit, routeDistanceKm } = {}
) {
  const km = Number(traveledKm);
  if (!Number.isFinite(km) || km < 0) return null;
  const pricing = await getPricingSettings();
  if (!pricing || pricing.enabled === false) return null;

  if (cargoType || measuredQuantity != null || measurementUnit) {
    return calculateDeliveryFare(
      {
        cargoType,
        measuredQuantity,
        measurementUnit,
        weight,
        loadType,
        traveledKm: km,
        routeDistanceKm,
      },
      pricing
    );
  }

  const rateKm = effectivePricingRate(pricing, loadType, "km");
  if (!(rateKm > 0)) return null;
  return calculateFareFromRates(weight, loadType, pricing, km);
}
