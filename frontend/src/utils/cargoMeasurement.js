/** Measurement units stored in DB / sent by API. Weight is always KG. MIXED = Others with 2+ units. */
export const MEASUREMENT_UNITS = ["KG", "LITER", "HEAD", "MIXED"];

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

  // Prefer explicit livestock labels from the booking picker.
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
  // Exact short names only (not free-text "Others" descriptions that mention ari/geel).
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
    // Skip loose livestock tokens here — handled by resolveLivestockKind.
    if (rule.unit === "HEAD") continue;
    if (rule.match.some((token) => normalized.includes(token))) {
      return { ...DEFAULT_RULE, ...rule, unitChoice: false };
    }
  }
  // Custom free-text cargo — driver picks KG / Liter / Head at pickup.
  return { ...DEFAULT_RULE, unitChoice: true };
}

export function weightInputToKg(amount, inputUnit = "kg") {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return inputUnit === "tons" ? n * 1000 : n;
}

export function normalizeMeasurementUnit(unit, cargoType) {
  const config = resolveCargoMeasurement(cargoType);
  const normalized = String(unit || config.unit).toUpperCase();
  if (MEASUREMENT_UNITS.includes(normalized)) return normalized;
  return config.unit;
}

/** HEAD (geel/ari/lo') must be a whole number ≥ 1 — not 0.1. */
export function validateMeasuredQuantity(rawQuantity, measurementUnit, cargoType) {
  const requested = String(measurementUnit || "").toUpperCase();
  const unit =
    MEASUREMENT_UNITS.includes(requested) && requested !== "MIXED"
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
        message: "Livestock (geel / ari / lo') waa tiro dhan — tusaale 1, 10, 35. Lama geli karo 0.1.",
      };
    }
    return { ok: true, quantity: qty, unit, message: null };
  }

  return { ok: true, quantity: qty, unit, message: null };
}

/**
 * Others pickup: one or more of kg / liter / head. At least one required.
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

  if (!candidates.length && measuredQuantity != null) {
    const unit = normalizeMeasurementUnit(measurementUnit || "KG", cargoType);
    if (unit !== "MIXED") {
      const check = validateMeasuredQuantity(measuredQuantity, unit, cargoType);
      if (!check.ok) return check;
      return {
        ok: true,
        parts: [{ unit: check.unit, quantity: check.quantity }],
        measuredQuantity: check.quantity,
        measurementUnit: check.unit,
        weightLabel: formatMeasuredQuantity(check.quantity, check.unit, cargoType),
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

/** Trip/request quantity for UI: measured at pickup, else booked weight. */
export function formatTripCargoQuantity(tripOrRequest) {
  if (!tripOrRequest) return "—";
  const cargoType = tripOrRequest.cargoType || "";
  const measured = formatMeasuredQuantity(
    tripOrRequest.measuredQuantity,
    tripOrRequest.measurementUnit,
    cargoType
  );
  if (measured) return measured;

  const weight = Number(tripOrRequest.cargoWeight ?? tripOrRequest.weight);
  if (Number.isFinite(weight) && weight > 0) {
    const unit = tripOrRequest.measurementUnit || resolveCargoMeasurement(cargoType).unit;
    return formatMeasuredQuantity(weight, unit, cargoType) || String(weight);
  }
  return "—";
}
