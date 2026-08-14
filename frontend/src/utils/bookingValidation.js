import { isValidFullName } from "./helpers";
import {
  somaliaLocations,
  somaliaRegions
} from "../data/somaliaLocations";

export const BOOKING_MESSAGES = {
  fromRegionRequired: "From region is required",
  fromDistrictRequired: "From district is required",
  fromNeighborhoodRequired: "From neighborhood is required",
  toRegionRequired: "To region is required",
  toDistrictRequired: "To district is required",
  toNeighborhoodRequired: "To neighborhood is required",
  invalidRegion: "Select a valid Somalia region",
  invalidDistrict: "District does not belong to the selected region",
  cargoTypeRequired: "Cargo type is required",
  fullNameInvalid: "Use a valid full name (letters and spaces; no numbers)",
  phoneInvalid: "Enter a valid phone number (at least 7 digits)"
};

export function validateFullNameField(value, { required = false, label = "Full name" } = {}) {
  const name = String(value || "").trim();
  if (!name) {
    return required ? `${label} is required` : true;
  }
  return isValidFullName(name) || BOOKING_MESSAGES.fullNameInvalid;
}

export function validateBookingPhone(value, { required = false } = {}) {
  const phone = String(value || "").trim();
  if (!phone) {
    return required ? BOOKING_MESSAGES.phoneInvalid : true;
  }
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 || BOOKING_MESSAGES.phoneInvalid;
}

function isValidRegion(region) {
  return somaliaRegions.includes(String(region || "").trim());
}

function isValidDistrict(region, district) {
  const key = String(region || "").trim();
  const dist = String(district || "").trim();
  return isValidRegion(key) && (somaliaLocations[key] || []).includes(dist);
}

/** Client-side mirror of backend validateStructuredBooking field messages. */
export function validateStructuredBookingFields(values = {}) {
  const errors = {};
  const fromRegion = String(values.fromRegion || "").trim();
  const fromDistrict = String(values.fromDistrict || "").trim();
  const fromNeighborhood = String(values.fromNeighborhood || "").trim();
  const toRegion = String(values.toRegion || "").trim();
  const toDistrict = String(values.toDistrict || "").trim();
  const toNeighborhood = String(values.toNeighborhood || "").trim();

  if (!fromRegion) errors.fromRegion = BOOKING_MESSAGES.fromRegionRequired;
  else if (!isValidRegion(fromRegion)) errors.fromRegion = BOOKING_MESSAGES.invalidRegion;

  if (!fromDistrict) errors.fromDistrict = BOOKING_MESSAGES.fromDistrictRequired;
  else if (fromRegion && isValidRegion(fromRegion) && !isValidDistrict(fromRegion, fromDistrict)) {
    errors.fromDistrict = BOOKING_MESSAGES.invalidDistrict;
  }

  if (!fromNeighborhood) errors.fromNeighborhood = BOOKING_MESSAGES.fromNeighborhoodRequired;

  if (!toRegion) errors.toRegion = BOOKING_MESSAGES.toRegionRequired;
  else if (!isValidRegion(toRegion)) errors.toRegion = BOOKING_MESSAGES.invalidRegion;

  if (!toDistrict) errors.toDistrict = BOOKING_MESSAGES.toDistrictRequired;
  else if (toRegion && isValidRegion(toRegion) && !isValidDistrict(toRegion, toDistrict)) {
    errors.toDistrict = BOOKING_MESSAGES.invalidDistrict;
  }

  if (!toNeighborhood) errors.toNeighborhood = BOOKING_MESSAGES.toNeighborhoodRequired;

  const cargoType =
    values.cargoType === "Others"
      ? String(values.cargoTypeOther || "").trim()
      : String(values.cargoType || "").trim();
  if (!cargoType) errors.cargoType = BOOKING_MESSAGES.cargoTypeRequired;

  for (const [field, label] of [
    ["senderName", "Sender name"],
    ["receiverName", "Receiver name"]
  ]) {
    const result = validateFullNameField(values[field], { label });
    if (result !== true) errors[field] = result;
  }

  for (const field of ["senderPhone", "receiverPhone"]) {
    const result = validateBookingPhone(values[field]);
    if (result !== true) errors[field] = result;
  }

  return errors;
}

export function applyFormValidationIssues(setError, issues = []) {
  for (const issue of issues) {
    const path = typeof issue === "object" ? issue.path : null;
    const message = typeof issue === "string" ? issue : issue?.message;
    if (path && message) {
      setError(path, { type: "server", message });
    }
  }
}
