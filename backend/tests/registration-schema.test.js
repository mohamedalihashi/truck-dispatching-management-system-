import { describe, expect, it } from "vitest";
import { driverRegisterSchema, registerSchema } from "../routes/auth.routes.js";

const password = "StrongPass1!";

describe("public registration validation", () => {
  it("accepts a customer with required profile fields", () => {
    const result = registerSchema.safeParse({
      name: "Customer One",
      username: "customer.one",
      email: "customer@example.com",
      phone: "+252610000001",
      password,
      role: "customer",
      customerProfile: {
        city: "Mogadishu",
        address: "Hodan"
      }
    });
    expect(result.success).toBe(true);
  });

  it("accepts a customer without email", () => {
    const result = registerSchema.safeParse({
      name: "Customer No Email",
      username: "customer.noemail",
      phone: "+252610000099",
      password,
      role: "customer",
      customerProfile: {
        city: "Mogadishu",
        address: "Hodan"
      }
    });
    expect(result.success).toBe(true);
    expect(result.data.email).toBeUndefined();
  });

  it("accepts a local /uploads profile photo path", () => {
    const result = registerSchema.safeParse({
      name: "Customer Two",
      username: "customer.two",
      email: "customer2@example.com",
      phone: "+252610000011",
      password,
      role: "customer",
      customerProfile: {
        city: "Mogadishu",
        address: "Wadajir",
        profilePhotoUrl: "/uploads/customers/photo.png"
      }
    });
    expect(result.success).toBe(true);
  });

  it("requires city and address", () => {
    const result = registerSchema.safeParse({
      name: "Customer Three",
      username: "customer.three",
      email: "customer3@example.com",
      phone: "+252610000002",
      password,
      role: "customer",
      customerProfile: { city: "Hargeisa" }
    });
    expect(result.success).toBe(false);
  });

  it("accepts a public driver registration with documents", () => {
    const result = driverRegisterSchema.safeParse({
      name: "Driver One",
      username: "driver.one",
      email: "driver@example.com",
      phone: "+252610000003",
      password,
      role: "driver",
      serviceType: "FTL",
      nationalIdNumber: "NID-1",
      driverLicense: "LIC-1",
      driverLicenseUrl: "https://cdn/lic.jpg",
      driverLicensePublicId: "lic",
      driverImageUrl: "https://cdn/profile.jpg",
      driverImagePublicId: "profile",
      truck: {
        truckNumber: "TR-1",
        plateNumber: "PL-1",
        capacity: "10 tons",
        truckType: "Flatbed",
        photoUrl1: "https://cdn/1.jpg",
        photoUrl2: "https://cdn/2.jpg",
        photoPublicId1: "one",
        photoPublicId2: "two",
        registrationDocumentUrl: "https://cdn/doc.pdf",
        registrationDocumentPublicId: "doc",
        documentUrls: ["https://cdn/doc.pdf"]
      }
    });
    expect(result.success).toBe(true);
  });

  it("requires driver documents and truck photo", () => {
    const result = driverRegisterSchema.safeParse({
      name: "Driver Two",
      username: "driver.two",
      email: "driver2@example.com",
      phone: "+252610000004",
      password,
      role: "driver",
      serviceType: "SHARED",
      driverLicense: "LIC-2",
      driverLicenseUrl: "https://cdn/lic.jpg",
      driverImageUrl: "https://cdn/profile.jpg",
      truck: {
        truckNumber: "TR-2",
        plateNumber: "PL-2",
        capacity: "8 tons",
        truckType: "Box",
        photoUrl1: "https://cdn/1.jpg",
        registrationDocumentUrl: "https://cdn/doc.pdf",
        documentUrls: []
      }
    });
    expect(result.success).toBe(false);
  });

  it.each(["admin"])("forbids public %s registration via customer schema", (role) => {
    expect(
      registerSchema.safeParse({
        name: "Blocked User",
        email: `${role}@example.com`,
        phone: "+252610009999",
        password,
        role
      }).success
    ).toBe(false);
  });
});
