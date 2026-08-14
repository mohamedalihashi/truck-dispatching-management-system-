/** Measurement units stored in DB / sent by API. Weight is always KG. */
export const MEASUREMENT_UNITS = ["KG", "LITER", "HEAD"];

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
  // Custom "Others" description (e.g. Cement) — driver picks KG / Liter / Head at pickup.
  return { ...DEFAULT_RULE, unitChoice: true };
}

export function weightInputToKg(amount, inputUnit = "kg") {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return inputUnit === "tons" ? n * 1000 : n;
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
