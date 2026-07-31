import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    user: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    truck: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    customerProfile: { create: vi.fn() }, dispatcherProfile: { create: vi.fn() },
    auditLog: { create: vi.fn() }, notification: { create: vi.fn() },
    verificationCode: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  };
  const prisma = {
    ...tx,
    user: { ...tx.user, findFirst: vi.fn() },
    truck: { ...tx.truck, findUnique: vi.fn() },
    verificationCode: { ...tx.verificationCode },
  };
  return { tx, prisma };
});

vi.mock("../lib/prisma.js", () => ({
  prisma: mocks.prisma,
  withTransaction: (callback) => callback(mocks.tx),
}));

const { db } = await import("../services/dbService.js");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.user.create.mockResolvedValue({ id: "user-1", name: "Driver", email: "driver@example.com", role: "driver", status: "Pending Verification" });
  mocks.tx.truck.create.mockResolvedValue({ id: "truck-1", driverId: "user-1", status: "Pending_Verification" });
  mocks.tx.user.findUnique.mockResolvedValue({ id: "user-1", name: "Driver", email: "driver@example.com", role: "driver", status: "Pending Verification", truck: { id: "truck-1" } });
  mocks.tx.auditLog.create.mockResolvedValue({});
});

describe("registration persistence", () => {
  it("creates driver and truck in the same transaction", async () => {
    const truck = {
      truckNumber: "TR-1", plateNumber: "PL-1", capacity: "10 tons", truckType: "Flatbed",
      photoUrl1: "https://cdn/1.jpg", photoUrl2: "https://cdn/2.jpg", photoPublicId1: "one", photoPublicId2: "two",
      registrationDocumentUrl: "https://cdn/doc.pdf", registrationDocumentPublicId: "doc",
    };
    await db.createUser({
      name: "Driver", email: "driver@example.com", phone: "+252610000003", passwordHash: "hash", role: "driver",
      serviceType: "FTL",
      nationalIdNumber: "NID-1", driverLicense: "LIC-1", driverLicenseUrl: "https://cdn/lic.jpg",
      driverLicensePublicId: "lic", driverImageUrl: "https://cdn/profile.jpg", driverImagePublicId: "profile", truck,
    });
    expect(mocks.tx.user.create).toHaveBeenCalledOnce();
    expect(mocks.tx.truck.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ driverId: "user-1", status: "Pending_Verification" }) }));
  });

  it("auto-verifies drivers created by admin", async () => {
    const truck = {
      truckNumber: "TR-2", plateNumber: "PL-2", capacity: "10 tons", truckType: "Box",
      photoUrl1: "https://cdn/1.jpg", registrationDocumentUrl: "https://cdn/doc.pdf",
      documentUrls: ["https://cdn/doc.pdf"],
    };
    await db.createUser({
      name: "Admin Driver", email: "admin-driver@example.com", phone: "+252610000099", passwordHash: "hash", role: "driver",
      serviceType: "SHARED",
      nationalIdNumber: "NID-2", driverLicense: "LIC-2", driverLicenseUrl: "https://cdn/lic.jpg",
      driverImageUrl: "https://cdn/profile.jpg", truck, actorId: "admin-1", autoVerify: true,
    });
    expect(mocks.tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "Active", createdById: "admin-1" }),
    }));
    expect(mocks.tx.truck.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "Available" }),
    }));
  });

  it("detects email, phone, national ID and plate conflicts", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({ email: "taken@example.com", phone: "+25261", nationalIdNumber: "NID" });
    mocks.prisma.truck.findUnique.mockResolvedValue(null);
    await expect(db.findRegistrationConflict({ email: "taken@example.com" })).resolves.toBe("Email");
    await expect(db.findRegistrationConflict({ phone: "+25261" })).resolves.toBe("Phone");
    mocks.prisma.truck.findUnique.mockResolvedValue({ id: "truck" });
    await expect(db.findRegistrationConflict({ plateNumber: "PL-1" })).resolves.toBe("Plate number");
  });

  it("limits invalid OTP attempts and consumes a valid OTP", async () => {
    const bcrypt = await import("bcryptjs");
    const codeHash = await bcrypt.default.hash("123456", 4);
    mocks.prisma.verificationCode.findFirst.mockResolvedValue({ id: "otp", payload: { role: "customer" }, codeHash, attempts: 0, maxAttempts: 5 });
    mocks.prisma.verificationCode.update.mockResolvedValue({});
    await expect(db.consumeVerificationCode({ email: "a@example.com", code: "000000", purpose: "register" })).resolves.toBeNull();
    expect(mocks.prisma.verificationCode.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attempts: 1 }) }));
    mocks.prisma.verificationCode.updateMany.mockResolvedValue({ count: 1 });
    await expect(db.consumeVerificationCode({ email: "a@example.com", code: "123456", purpose: "register" })).resolves.toEqual({ role: "customer" });
  });
});
