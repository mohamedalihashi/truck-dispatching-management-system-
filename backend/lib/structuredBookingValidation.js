import { isValidSomaliaDistrict, isValidSomaliaRegion } from "./somaliaLocations.js";
import { isValidBookingPhone } from "./phone.js";
import { fullNameSchema } from "./validation.js";

function trimmed(value) {
  return String(value || "").trim();
}

function addNameIssue(ctx, path, value) {
  const name = trimmed(value);
  if (!name) return;
  const parsed = fullNameSchema.safeParse(name);
  if (!parsed.success) {
    ctx.addIssue({
      code: "custom",
      path: [path],
      message: parsed.error.issues[0]?.message || "Use a valid full name (letters and spaces; no numbers)"
    });
  }
}

function addPhoneIssue(ctx, path, value) {
  const phone = trimmed(value);
  if (!phone) return;
  if (!isValidBookingPhone(phone)) {
    ctx.addIssue({
      code: "custom",
      path: [path],
      message: "Enter a valid phone number (at least 7 digits)"
    });
  }
}

/**
 * Structured Somalia route booking rules (shared by create + update schemas).
 */
export function validateStructuredBooking(data, ctx, { allowLegacy = true } = {}) {
  const usesStructuredLocations = Boolean(
    trimmed(data.fromRegion) ||
      trimmed(data.fromDistrict) ||
      trimmed(data.fromNeighborhood) ||
      trimmed(data.toRegion) ||
      trimmed(data.toDistrict) ||
      trimmed(data.toNeighborhood)
  );

  if (!usesStructuredLocations && allowLegacy) {
    if (!trimmed(data.pickup)) {
      ctx.addIssue({ code: "custom", path: ["pickup"], message: "Pickup is required" });
    }
    if (!trimmed(data.destination)) {
      ctx.addIssue({ code: "custom", path: ["destination"], message: "Destination is required" });
    }
    return;
  }

  const fromRegion = trimmed(data.fromRegion);
  const fromDistrict = trimmed(data.fromDistrict);
  const fromNeighborhood = trimmed(data.fromNeighborhood);
  const toRegion = trimmed(data.toRegion);
  const toDistrict = trimmed(data.toDistrict);
  const toNeighborhood = trimmed(data.toNeighborhood);

  if (!fromRegion) {
    ctx.addIssue({ code: "custom", path: ["fromRegion"], message: "From region is required" });
  } else if (!isValidSomaliaRegion(fromRegion)) {
    ctx.addIssue({ code: "custom", path: ["fromRegion"], message: "Select a valid Somalia region" });
  }

  if (!fromDistrict) {
    ctx.addIssue({ code: "custom", path: ["fromDistrict"], message: "From district is required" });
  } else if (fromRegion && isValidSomaliaRegion(fromRegion) && !isValidSomaliaDistrict(fromRegion, fromDistrict)) {
    ctx.addIssue({
      code: "custom",
      path: ["fromDistrict"],
      message: "District does not belong to the selected region"
    });
  }

  if (!fromNeighborhood) {
    ctx.addIssue({ code: "custom", path: ["fromNeighborhood"], message: "From neighborhood is required" });
  }

  if (!toRegion) {
    ctx.addIssue({ code: "custom", path: ["toRegion"], message: "To region is required" });
  } else if (!isValidSomaliaRegion(toRegion)) {
    ctx.addIssue({ code: "custom", path: ["toRegion"], message: "Select a valid Somalia region" });
  }

  if (!toDistrict) {
    ctx.addIssue({ code: "custom", path: ["toDistrict"], message: "To district is required" });
  } else if (toRegion && isValidSomaliaRegion(toRegion) && !isValidSomaliaDistrict(toRegion, toDistrict)) {
    ctx.addIssue({
      code: "custom",
      path: ["toDistrict"],
      message: "District does not belong to the selected region"
    });
  }

  if (!toNeighborhood) {
    ctx.addIssue({ code: "custom", path: ["toNeighborhood"], message: "To neighborhood is required" });
  }

  const cargoType = trimmed(data.cargoType);
  const description = trimmed(data.description);
  if (!cargoType && !description) {
    ctx.addIssue({ code: "custom", path: ["cargoType"], message: "Cargo type is required" });
  }

  addNameIssue(ctx, "senderName", data.senderName);
  addNameIssue(ctx, "receiverName", data.receiverName);
  addPhoneIssue(ctx, "senderPhone", data.senderPhone);
  addPhoneIssue(ctx, "receiverPhone", data.receiverPhone);
}
