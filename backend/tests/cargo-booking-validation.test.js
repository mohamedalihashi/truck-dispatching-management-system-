import { describe, expect, it } from "vitest";
import { cargoRequestSchema } from "../routes/cargoRequests.routes.js";
import {
  formatSomaliaLocation,
  isValidSomaliaDistrict,
  isValidSomaliaRegion
} from "../lib/somaliaLocations.js";
import { normalizeSomaliPhone } from "../lib/phone.js";

const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const validBooking = {
  fromRegion: "Banaadir",
  fromDistrict: "Hodan",
  fromNeighborhood: "Taleex",
  toRegion: "Bay",
  toDistrict: "Baydhabo",
  toNeighborhood: "Horseed",
  truckType: "Flatbed",
  weight: "250 kg",
  preferredPickupDate: tomorrow,
  description: "General cargo"
};

describe("cargo booking validation", () => {
  it("accepts a structured booking without sender/receiver", () => {
    expect(cargoRequestSchema.safeParse(validBooking).success).toBe(true);
  });

  it("accepts TBD weight for shared-style bookings", () => {
    expect(cargoRequestSchema.safeParse({
      ...validBooking,
      weight: "TBD",
      loadType: "SHARED"
    }).success).toBe(true);
  });

  it("rejects a district outside its region", () => {
    const result = cargoRequestSchema.safeParse({ ...validBooking, fromDistrict: "Baydhabo" });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive weights and past dates", () => {
    const result = cargoRequestSchema.safeParse({
      ...validBooking,
      weight: "0",
      preferredPickupDate: "2020-01-01"
    });
    expect(result.success).toBe(false);
  });

  it("requires all structured location fields with clear messages", () => {
    const result = cargoRequestSchema.safeParse({
      fromNeighborhood: "Taleex",
      cargoType: "Food"
    });
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((issue) => issue.message);
    expect(messages).toContain("From region is required");
    expect(messages).toContain("To region is required");
  });

  it("rejects numeric sender names", () => {
    const result = cargoRequestSchema.safeParse({
      ...validBooking,
      cargoType: "Food",
      senderName: "12345"
    });
    expect(result.success).toBe(false);
    expect(result.error.issues.some((issue) => issue.path.join(".") === "senderName")).toBe(true);
    expect(result.error.issues.some((issue) => /letters and spaces/i.test(issue.message))).toBe(true);
  });

  it("requires cargo type when description is missing", () => {
    const result = cargoRequestSchema.safeParse({
      ...validBooking,
      cargoType: "",
      description: ""
    });
    expect(result.success).toBe(false);
    expect(result.error.issues.some((issue) => issue.path.join(".") === "cargoType")).toBe(true);
  });

  it("accepts FTL Management-system-style requests without a preferred truck", () => {
    expect(cargoRequestSchema.safeParse({
      ...validBooking,
      loadType: "FTL"
    }).success).toBe(true);
  });

  it("provides reusable region, district, and formatted route helpers", () => {
    expect(isValidSomaliaRegion("Banaadir")).toBe(true);
    expect(isValidSomaliaDistrict("Banaadir", "Hodan")).toBe(true);
    expect(isValidSomaliaDistrict("Bay", "Hodan")).toBe(false);
    expect(formatSomaliaLocation("Taleex", "Hodan", "Banaadir")).toBe("Taleex, Hodan, Banaadir");
  });

  it("normalizes valid Somali mobile numbers to international format", () => {
    expect(normalizeSomaliPhone("061 234 5678")).toBe("+252612345678");
    expect(normalizeSomaliPhone("252612345678")).toBe("+252612345678");
    expect(normalizeSomaliPhone("4235356467")).toBe("+4235356467");
    expect(() => normalizeSomaliPhone("12345")).toThrow("valid phone number");
  });
});
