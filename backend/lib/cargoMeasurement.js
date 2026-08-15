/** Measurement units stored in DB / sent by API. Weight is always KG. MIXED = Others with 2+ units. */
export const MEASUREMENT_UNITS = ["KG", "LITER", "HEAD", "MIXED"];

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
  if (!normalized || normalized.startsWith("others")) return null;

  for (const kind of LIVESTOCK_KINDS) {
    const label = normalizeCargoType(kind.label);
    if (
      normalized.startsWith("livestock") &&
      (normalized.includes(label) || kind.match.some((token) => normalized.includes(token)))
    ) {
      return kind;
    }
  }
  if (normalized === "livestock" || normalized.startsWith("livestock")) {
    return LIVESTOCK_KINDS.find((k) => k.id === "sheep");
  }
  for (const kind of LIVESTOCK_KINDS) {
    if (kind.match.some((token) => normalized === token || normalized === normalizeCargoType(kind.label))) {
      return kind;
    }
  }
  return null;
}

export function resolveCargoMeasurement(cargoType) {
  const normalized = normalizeCargoType(cargoType);
  if (!normalized || normalized === "others" || normalized === "other" || normalized.startsWith("others")) {
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
    if (rule.unit === "HEAD") continue;
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
      return `${Math.round(n)}${suffix}`;
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

/**
 * Build validated pickup parts from one or more Others boxes (kg / liter / head).
 * At least one required; multiple allowed for mixed cargo.
 */
export function resolvePickupMeasurements(
  { measuredQuantity, measurementUnit, measurements, weightKg } = {},
  cargoType = ""
) {
  const raw = measurements && typeof measurements === "object" ? measurements : null;
  const kg =
    raw != null
      ? Number(raw.kg ?? raw.KG ?? 0)
      : measurementUnit === "KG" || (!measurementUnit && weightKg != null)
        ? Number(measuredQuantity ?? weightKg)
        : 0;
  const liter =
    raw != null
      ? Number(raw.liter ?? raw.LITER ?? 0)
      : String(measurementUnit || "").toUpperCase() === "LITER"
        ? Number(measuredQuantity)
        : 0;
  const head =
    raw != null
      ? Number(raw.head ?? raw.HEAD ?? 0)
      : String(measurementUnit || "").toUpperCase() === "HEAD"
        ? Number(measuredQuantity)
        : 0;

  const candidates = [
    kg > 0 ? { unit: "KG", quantity: kg } : null,
    liter > 0 ? { unit: "LITER", quantity: liter } : null,
    head > 0 ? { unit: "HEAD", quantity: head } : null,
  ].filter(Boolean);

  // Single-unit legacy path when measurements object was not used
  if (!candidates.length && measuredQuantity != null) {
    const unit = normalizeMeasurementUnit(measurementUnit || "KG", cargoType);
    if (unit !== "MIXED") {
      const check = validateMeasuredQuantity(measuredQuantity, unit, cargoType);
      if (!check.ok) return check;
      const label = formatMeasuredQuantity(check.quantity, check.unit, cargoType);
      return {
        ok: true,
        parts: [{ unit: check.unit, quantity: check.quantity }],
        measuredQuantity: check.quantity,
        measurementUnit: check.unit,
        weightLabel: label,
        message: null,
      };
    }
  }

  if (!candidates.length) {
    return {
      ok: false,
      quantity: null,
      unit: null,
      message: "Gali ugu yaraan hal box (KG, Liter, ama Head / Neef)",
    };
  }

  const parts = [];
  for (const candidate of candidates) {
    const check = validateMeasuredQuantity(candidate.quantity, candidate.unit, cargoType);
    if (!check.ok) return check;
    parts.push({ unit: check.unit, quantity: check.quantity });
  }

  const weightLabel = parts
    .map((p) => formatMeasuredQuantity(p.quantity, p.unit, cargoType))
    .filter(Boolean)
    .join(" + ");
  const primary = parts.find((p) => p.unit === "KG") || parts[0];

  return {
    ok: true,
    parts,
    measuredQuantity: primary.quantity,
    measurementUnit: parts.length > 1 ? "MIXED" : primary.unit,
    weightLabel,
    message: null,
  };
}

/** Parse mixed pickup label back into parts for pricing. */
export function parseMeasurementParts(weight = "", measurementUnit = "", measuredQuantity = null) {
  const unit = String(measurementUnit || "").toUpperCase();
  const text = String(weight || "");
  if (unit === "MIXED" || (text.includes("+") && /\d/.test(text))) {
    const parts = [];
    const tonMatch = text.match(/([\d.]+)\s*tons?\b/i);
    const kgMatch = text.match(/([\d.]+)\s*kg\b/i);
    if (tonMatch) parts.push({ unit: "KG", quantity: Number(tonMatch[1]) * 1000 });
    else if (kgMatch) parts.push({ unit: "KG", quantity: Number(kgMatch[1]) });

    const literMatch = text.match(/([\d.]+)\s*liters?\b/i);
    if (literMatch) parts.push({ unit: "LITER", quantity: Number(literMatch[1]) });

    const headMatch = text.match(/([\d.]+)\s*(?:head|neef|geel|ari|lo'|camels?|sheep|goats?)\b/i);
    if (headMatch) {
      const n = Number(headMatch[1]);
      if (Number.isInteger(n) && n > 0) parts.push({ unit: "HEAD", quantity: n });
    }
    if (parts.length) return parts;
  }

  if (measuredQuantity != null && Number(measuredQuantity) > 0 && unit && unit !== "MIXED") {
    return [{ unit, quantity: Number(measuredQuantity) }];
  }
  return [];
}

/**
 * Validate pickup quantity. HEAD (geel/ari/lo') must be a whole number ≥ 1.
 * Returns { ok, quantity, unit, message }.
 */
export function validateMeasuredQuantity(rawQuantity, measurementUnit, cargoType) {
  const requested = String(measurementUnit || "").toUpperCase();
  // For Others multi-box, trust the unit the driver filled (do not remap HEAD→KG).
  const unit = MEASUREMENT_UNITS.includes(requested) && requested !== "MIXED"
    ? requested
    : normalizeMeasurementUnit(measurementUnit, cargoType);
  const config = resolveCargoMeasurement(cargoType);
  const qty = Number(rawQuantity);

  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      ok: false,
      quantity: null,
      unit,
      message: `Gali ${String(config.label || "quantity").toLowerCase()} (number > 0)`,
    };
  }

  if (unit === "HEAD") {
    if (!Number.isInteger(qty) || qty < 1) {
      return {
        ok: false,
        quantity: null,
        unit,
        message: "Livestock (geel / ari / lo') waa inuu ahaadaa tiro dhan — tusaale 1, 10, 35. Lama geli karo 0.1.",
      };
    }
    return { ok: true, quantity: qty, unit, message: null };
  }

  return { ok: true, quantity: qty, unit, message: null };
}

/** Pricing rate key for cargo charge (kg, liter, camel, sheep, goat). */
export function cargoPricingKey(cargoType, measurementUnit) {
  const config = resolveCargoMeasurement(cargoType);
  const unit = String(measurementUnit || config.unit).toUpperCase();
  if (unit === "LITER") return "liter";
  if (unit === "HEAD") {
    if (config.unitChoice) return "sheep"; // Others mixed head → sheep rate
    return config.pricingKey || "sheep";
  }
  return "kg";
}
