import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    cargoRequest: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), create: vi.fn() },
    bid: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    trip: { create: vi.fn() },
    truck: { update: vi.fn() },
    notification: { create: vi.fn() },
  };
  return { prisma };
});

vi.mock("../lib/prisma.js", () => ({
  prisma: mocks.prisma,
  withTransaction: (callback) => callback(mocks.prisma),
}));

const { bidRepository } = await import("../services/db/bidRepository.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("marketplace bids", () => {
  it("rejects SHARED drivers from bidding", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "driver-1",
      role: "driver",
      serviceType: "SHARED",
      status: "Active",
      truck: { id: "truck-1" },
    });

    await expect(
      bidRepository.createBid({
        cargoRequestId: "REQ-1001",
        driverId: "driver-1",
        amount: 500,
      })
    ).rejects.toMatchObject({ status: 403, message: expect.stringContaining("FTL") });
  });

  it("creates a bid on an open FTL request", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "driver-1",
      role: "driver",
      serviceType: "FTL",
      status: "Active",
      truck: { id: "truck-1" },
    });
    mocks.prisma.cargoRequest.findUnique.mockResolvedValue({
      id: "REQ-1001",
      loadType: "FTL",
      status: "Pending",
      driverId: null,
      customerId: "cust-1",
    });
    mocks.prisma.bid.findUnique.mockResolvedValue(null);
    mocks.prisma.bid.create.mockResolvedValue({
      id: "bid-1",
      cargoRequestId: "REQ-1001",
      driverId: "driver-1",
      truckId: "truck-1",
      amount: 500,
      estimatedDays: 2,
      notes: null,
      status: "Pending",
      createdAt: new Date(),
      updatedAt: new Date(),
      driver: { name: "Ali", phone: "+252612345678" },
      truck: { truckNumber: "TR-1" },
      cargoRequest: null,
    });
    mocks.prisma.notification.create.mockResolvedValue({});

    const bid = await bidRepository.createBid({
      cargoRequestId: "REQ-1001",
      driverId: "driver-1",
      amount: 500,
      estimatedDays: 2,
    });

    expect(bid.id).toBe("bid-1");
    expect(mocks.prisma.bid.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.notification.create).toHaveBeenCalledOnce();
  });

  it("accepts a bid and creates a trip", async () => {
    mocks.prisma.bid.findUnique.mockResolvedValue({
      id: "bid-1",
      status: "Pending",
      amount: 500,
      driverId: "driver-1",
      truckId: "truck-1",
      cargoRequestId: "REQ-1001",
      cargoRequest: {
        id: "REQ-1001",
        customerId: "cust-1",
        driverId: null,
        pickup: "Mogadishu",
        destination: "Hargeisa",
        distanceKm: 840,
      },
      driver: { truck: { id: "truck-1" } },
    });
    mocks.prisma.bid.update.mockResolvedValue({});
    mocks.prisma.bid.updateMany.mockResolvedValue({});
    mocks.prisma.cargoRequest.update.mockResolvedValue({ id: "REQ-1001" });
    mocks.prisma.trip.create.mockResolvedValue({ id: "TRP-ABC" });
    mocks.prisma.truck.update.mockResolvedValue({});
    mocks.prisma.notification.create.mockResolvedValue({});

    const result = await bidRepository.acceptBid({ bidId: "bid-1", customerId: "cust-1" });

    expect(result.tripId).toBe("TRP-ABC");
    expect(mocks.prisma.trip.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.bid.updateMany).toHaveBeenCalledOnce();
  });
});
