/** Measurement units stored in DB / sent by API. Weight is always KG. */
export const MEASUREMENT_UNITS = ["KG", "LITER", "HEAD"];

/** Livestock kinds — each has its own per-head rate. */
export const LIVESTOCK_KINDS = [
  { id: "camel", label: "Geel (Camels)", match: ["geel", "camel"], pricingKey: "Camel" },
  { id: "sheep", label: "Ari (Sheep)", match: ["ari", "sheep"], pricingKey: "Sheep" },
  { id: "goat", label: "Lo' (Goats)", match: ["lo'", "lo ", " goat", "goat"], pricingKey: "Goat" },
];

export const LIVESTOCK_CARGO_TYPES = LIVESTOCK_KINDS.map((k) => `Livestock — ${k.label}`);

const DEFAULT_RULE = {
  unit: "KG",
  label: "Actual Weight",
  inputLabel: "KG",
  placeholder: "850",
  pricingKey: "kg",
};

const CARGO_RULES = [
  {
    match: ["fuel", "fuel & oil", "oil"],
    unit: "LITER",
    label: "Actual Volume",
    inputLabel: "Liters",
    placeholder: "5000",
    pricingKey: "liter",
  },
  {
    match: ["water"],
    unit: "LITER",
    label: "Actual Volume",
    inputLabel: "Liters",
    placeholder: "5000",
    pricingKey: "liter",
  },
  {
    match: ["livestock", "geel", "camel", "ari", "sheep", "goat", "lo'"],
    unit: "HEAD",
    label: "Number of Animals",
    inputLabel: "Head / Neef",
    placeholder: "35",
    pricingKey: "head",
  },
  {
    match: ["food", "beverage", "grain", "agricultural", "perishable"],
    unit: "KG",
    label: "Actual Weight",
    inputLabel: "KG",
    placeholder: "850",
    pricingKey: "kg",
  },
  {
    match: ["general", "electronic", "furniture", "construction", "other"],
    unit: "KG",
    label: "Actual Weight",
    inputLabel: "KG",
    placeholder: "850",
    pricingKey: "kg",
  },
];

function normalizeCargoType(value = "") {
  return String(value).toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();
}

export function resolveLivestockKind(cargoType) {
  const normalized = normalizeCargoType(cargoType);
  if (!normalized) return null;

  for (const kind of LIVESTOCK_KINDS) {
    if (kind.match.some((token) => normalized.includes(token))) return kind;
  }
  if (normalized.includes("livestock")) {
    return LIVESTOCK_KINDS.find((k) => k.id === "sheep");
  }
  return null;
}

export function resolveCargoMeasurement(cargoType) {
  const normalized = normalizeCargoType(cargoType);
  if (!normalized || normalized === "others" || normalized === "other") {
    return { ...DEFAULT_RULE, unitChoice: true };
  }

  const livestock = resolveLivestockKind(cargoType);
  if (livestock) {
    return {
      ...DEFAULT_RULE,
      unit: "HEAD",
      label: `Number of ${livestock.label}`,
      inputLabel: "Head / Neef",
      placeholder: livestock.id === "camel" ? "10" : "35",
      pricingKey: livestock.pricingKey.toLowerCase(),
      livestockKind: livestock.id,
      livestockLabel: livestock.label,
      unitChoice: false,
    };
  }

  for (const rule of CARGO_RULES) {
    if (rule.match.some((token) => normalized.includes(token))) {
      return { ...DEFAULT_RULE, ...rule, unitChoice: false };
    }
  }
  // Custom "Others" description — allow KG / LITER / HEAD from the driver.
  return { ...DEFAULT_RULE, unitChoice: true };
}

export function weightInputToKg(amount, inputUnit = "kg") {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return inputUnit === "tons" ? n * 1000 : n;
}

export function defaultWeightInputUnit(amountKg = 0) {
  const n = Number(amountKg);
  return Number.isFinite(n) && n >= 1000 ? "tons" : "kg";
}

export function formatMeasuredQuantity(quantity, unit = "KG", cargoType = "") {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return "";

  switch (String(unit || "KG").toUpperCase()) {
    case "LITER":
      return `${Math.round(n * 1000) / 1000} liters`;
    case "HEAD": {
      const kind = resolveLivestockKind(cargoType);
      const suffix = kind ? ` ${kind.label}` : " head";
      return `${Math.round(n * 1000) / 1000}${suffix}`;
    }
    default:
      if (n >= 1000) {
        const tons = Math.round((n / 1000) * 1000) / 1000;
        return `${tons} tons`;
      }
      return `${Math.round(n * 1000) / 1000} kg`;
  }
}

export function parseLegacyQuantity(weight, targetUnit = "KG") {
  const raw = String(weight || "").trim().toLowerCase();
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;

  const unit = String(targetUnit || "KG").toUpperCase();
  if (unit === "LITER") {
    if (/\bl(it(er)?s?)?\b/.test(raw)) return n;
    return 0;
  }
  if (unit === "HEAD") {
    if (/\b(head|neef|animals?|geel|camel|ari|sheep|goat|lo')\b/.test(raw)) return n;
    return 0;
  }
  if (/\btons?\b/.test(raw) || raw.includes("tonne")) return n * 1000;
  return n;
}

export function normalizeMeasurementUnit(unit, cargoType) {
  const config = resolveCargoMeasurement(cargoType);
  const normalized = String(unit || config.unit).toUpperCase();
  if (MEASUREMENT_UNITS.includes(normalized)) return normalized;
  return config.unit;
}

/** Pricing rate key for cargo charge (kg, liter, camel, sheep, goat). */
export function cargoPricingKey(cargoType, measurementUnit) {
  const config = resolveCargoMeasurement(cargoType);
  const unit = String(measurementUnit || config.unit).toUpperCase();
  if (unit === "LITER") return "liter";
  if (unit === "HEAD") return config.pricingKey || "sheep";
  return "kg";
}
