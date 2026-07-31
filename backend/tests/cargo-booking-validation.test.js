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
  customerRole: "SENDER",
  fromRegion: "Banaadir",
  fromDistrict: "Hodan",
  fromNeighborhood: "Taleex",
  toRegion: "Bay",
  toDistrict: "Baydhabo",
  toNeighborhood: "Horseed",
  receiverName: "Receiver One",
  receiverPhone: "+252 61 2345678",
  truckType: "Flatbed",
  weight: "2.5",
  preferredPickupDate: tomorrow,
  description: "General cargo"
};

describe("cargo booking validation", () => {
  it("accepts a complete sender booking", () => {
    expect(cargoRequestSchema.safeParse(validBooking).success).toBe(true);
  });

  it("accepts a complete receiver booking", () => {
    expect(cargoRequestSchema.safeParse({
      ...validBooking,
      customerRole: "RECEIVER",
      receiverName: undefined,
      receiverPhone: undefined,
      senderName: "Sender One",
      senderPhone: "0612345678"
    }).success).toBe(true);
  });

  it("rejects a district outside its region", () => {
    const result = cargoRequestSchema.safeParse({ ...validBooking, fromDistrict: "Baydhabo" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid phones, blank names, non-positive weights, and past dates", () => {
    const result = cargoRequestSchema.safeParse({
      ...validBooking,
      receiverName: "  ",
      receiverPhone: "12345",
      weight: "0",
      preferredPickupDate: "2020-01-01"
    });
    expect(result.success).toBe(false);
  });

  it("accepts open FTL marketplace requests without a preferred truck", () => {
    expect(cargoRequestSchema.safeParse({
      ...validBooking,
      openForBids: true,
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
