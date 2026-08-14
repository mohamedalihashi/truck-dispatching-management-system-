import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    sharedTrip: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    cargoRequest: { create: vi.fn(), update: vi.fn() },
    sharedTripBooking: { create: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() },
    trip: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    payment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    truck: { update: vi.fn() },
  };
  return { prisma };
});

vi.mock("../lib/prisma.js", () => ({
  prisma: mocks.prisma,
  withTransaction: (callback) => callback(mocks.prisma),
}));

vi.mock("../services/pricingService.js", () => ({
  estimateDistanceKm: vi.fn().mockReturnValue(100),
  estimateEtaLabel: vi.fn().mockReturnValue("About 3 hours"),
}));

vi.mock("../services/pricingRates.js", () => ({
  estimateFare: vi.fn().mockResolvedValue(100),
  parseWeightKg: vi.fn((w) => Number.parseFloat(String(w)) || 0),
  getPricingSettings: vi.fn().mockResolvedValue({
    enabled: true,
    ftlPricePerKg: 1,
    sharedPricePerKg: 1,
    ftlPricePerKm: 0,
    sharedPricePerKm: 0,
  }),
}));

vi.mock("../services/waafiPayService.js", () => ({
  buildWaafiReferenceId: vi.fn((id) => `REF-${id}`),
}));

const { sharedTripRepository } = await import("../services/db/sharedTripRepository.js");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.sharedTrip.count.mockResolvedValue(0);
});

describe("shared trips", () => {
  it("rejects FTL drivers from creating shared trips", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "driver-1",
      role: "driver",
      serviceType: "FTL",
      truck: { id: "truck-1" },
    });

    await expect(
      sharedTripRepository.createSharedTrip({
        driverId: "driver-1",
        pickup: "Mogadishu",
        destination: "Baidoa",
        departureDate: "2026-08-01",
        durationAmount: 6,
        durationUnit: "hours",
        totalCapacityTons: 10,
        pricePerTon: 20,
      })
    ).rejects.toMatchObject({ status: 403, message: expect.stringContaining("SHARED") });
  });

  it("creates a shared trip for SHARED drivers", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "driver-1",
      role: "driver",
      serviceType: "SHARED",
      status: "Active",
      truck: { id: "truck-1", truckType: "Box", capacityTons: 10 },
    });
    mocks.prisma.sharedTrip.create.mockResolvedValue({
      id: "ST-ABC",
      driverId: "driver-1",
      truckId: "truck-1",
      pickup: "Mogadishu",
      destination: "Baidoa",
      fromRegion: null,
      fromDistrict: null,
      toRegion: null,
      toDistrict: null,
      departureDate: new Date("2026-08-01"),
      durationAmount: 6,
      durationUnit: "hours",
      totalCapacityTons: 10,
      availableTons: 10,
      pricePerTon: 20,
      notes: null,
      status: "Open for booking",
      createdAt: new Date(),
      updatedAt: new Date(),
      driver: { name: "Hassan", phone: "+252612345678", serviceType: "SHARED" },
      truck: { truckNumber: "TR-2", truckType: "Box" },
      _count: { bookings: 0 },
    });

    const trip = await sharedTripRepository.createSharedTrip({
      driverId: "driver-1",
      pickup: "Mogadishu",
      destination: "Baidoa",
      departureDate: "2026-08-01",
      durationAmount: 6,
      durationUnit: "hours",
      totalCapacityTons: 10,
      pricePerTon: 20,
    });

    expect(trip.id).toBe("ST-ABC");
    expect(trip.availableTons).toBe(10);
    expect(trip.durationAmount).toBe(6);
    expect(mocks.prisma.sharedTrip.create).toHaveBeenCalledOnce();
  });

  it("rejects a second active shared trip", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "driver-1",
      role: "driver",
      serviceType: "SHARED",
      status: "Active",
      truck: { id: "truck-1", capacityTons: 10 },
    });
    mocks.prisma.sharedTrip.count.mockResolvedValueOnce(1);

    await expect(
      sharedTripRepository.createSharedTrip({
        driverId: "driver-1",
        pickup: "Mogadishu",
        destination: "Baidoa",
        departureDate: "2026-08-02",
        durationAmount: 1,
        durationUnit: "days",
        pricePerTon: 20,
      })
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("Finish your current shared trip"),
    });
  });

  it("books shared capacity and creates full-fare invoice immediately", async () => {
    mocks.prisma.sharedTrip.findUnique.mockResolvedValue({
      id: "ST-ABC",
      status: "Open for booking",
      availableTons: 10,
      totalCapacityTons: 10,
      pricePerTon: 20,
      pickup: "Mogadishu",
      destination: "Baidoa",
      fromRegion: "Banaadir",
      fromDistrict: "Hodan",
      toRegion: "Bay",
      toDistrict: "Baydhabo",
      driverId: "driver-1",
      truckId: "truck-1",
      driver: { truck: { truckType: "Box" } },
    });
    mocks.prisma.cargoRequest.create.mockResolvedValue({
      id: "REQ-9001",
      customerId: "cust-1",
      loadType: "SHARED",
      status: "Assigned",
      pickup: "Mogadishu",
      destination: "Baidoa",
      truckType: "Box",
      weight: "2 tons",
      description: "Goods",
      quotedPrice: 40,
      finalPrice: 40,
      customer: { name: "Customer" },
      driver: { name: "Hassan" },
      truck: { truckNumber: "TR-2" },
    });
    mocks.prisma.sharedTripBooking.create.mockResolvedValue({ id: "b1" });
    mocks.prisma.trip.findFirst.mockResolvedValue(null);
    mocks.prisma.trip.create.mockResolvedValue({ id: "SHP-1" });
    mocks.prisma.payment.findFirst.mockResolvedValue(null);
    mocks.prisma.payment.create.mockResolvedValue({});
    mocks.prisma.sharedTripBooking.update.mockResolvedValue({});
    mocks.prisma.sharedTrip.update.mockResolvedValue({});
    mocks.prisma.notification.create.mockResolvedValue({});

    const request = await sharedTripRepository.bookSharedCapacity({
      sharedTripId: "ST-ABC",
      customerId: "cust-1",
      customerName: "Customer",
      weightTons: 2,
      description: "Goods",
    });

    expect(request.id).toBe("REQ-9001");
    expect(request.tripId).toBe("SHP-1");
    expect(request.depositPercent).toBe(0);
    expect(request.fullPaymentOnce).toBe(false);
    expect(request.payAfterDelivery).toBe(true);
    expect(mocks.prisma.payment.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.cargoRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quotedPrice: 40, finalPrice: 40, status: "Assigned" }),
      })
    );
  });

  it("allows pickup before payment (pay after Delivered)", async () => {
    const unpaidBooking = {
      id: "b1",
      cargoRequestId: "REQ-1",
      cargoRequest: {
        id: "REQ-1",
        customerId: "cust-1",
        pickup: "Mogadishu",
        destination: "Baidoa",
        finalPrice: 100,
        quotedPrice: 100,
        distanceKm: 50,
        quotedEstimatedTime: "2h",
        status: "Assigned",
        trips: [
          {
            id: "SHP-1",
            status: "Assigned",
            fare: 100,
            payments: [{ amount: 100, amountPaid: 0 }],
          },
        ],
      },
    };

    mocks.prisma.sharedTrip.findUnique.mockResolvedValue({
      id: "ST-ABC",
      driverId: "driver-1",
      truckId: "truck-1",
      pickup: "Mogadishu",
      destination: "Baidoa",
      status: "Full",
      totalCapacityTons: 10,
      bookings: [unpaidBooking],
    });
    mocks.prisma.cargoRequest.update.mockResolvedValue({
      ...unpaidBooking.cargoRequest,
      weight: "250 kg",
      finalPrice: 100,
    });
    mocks.prisma.trip.findFirst.mockResolvedValue(unpaidBooking.cargoRequest.trips[0]);
    mocks.prisma.payment.findFirst.mockResolvedValue({
      ...unpaidBooking.cargoRequest.trips[0].payments[0],
      id: "pay-1",
      amountPaid: 0,
    });
    mocks.prisma.payment.update.mockResolvedValue({});
    mocks.prisma.trip.update.mockResolvedValue({});
    mocks.prisma.sharedTripBooking.update.mockResolvedValue({});
    mocks.prisma.truck.update.mockResolvedValue({});
    mocks.prisma.notification.create.mockResolvedValue({});
    mocks.prisma.sharedTrip.update.mockResolvedValue({
      id: "ST-ABC",
      driverId: "driver-1",
      status: "Pickup",
      pickup: "Mogadishu",
      destination: "Baidoa",
      totalCapacityTons: 10,
      availableTons: 0,
      pricePerTon: 20,
      durationAmount: 6,
      durationUnit: "hours",
      departureDate: new Date("2026-08-01"),
      driver: { name: "Hassan" },
      truck: { truckNumber: "TR-2" },
      _count: { bookings: 1 },
    });

    const trip = await sharedTripRepository.startSharedTripPickup("ST-ABC", "driver-1", {
      weightsByBookingId: { b1: 250 },
    });
    expect(trip.status).toBe("Pickup");
  });

  it("starts pickup after full fare is paid", async () => {
    const paidBooking = {
      id: "b1",
      cargoRequestId: "REQ-1",
      cargoRequest: {
        id: "REQ-1",
        customerId: "cust-1",
        pickup: "Mogadishu",
        destination: "Baidoa",
        finalPrice: 100,
        quotedPrice: 100,
        distanceKm: 50,
        quotedEstimatedTime: "2h",
        status: "Assigned",
        trips: [
          {
            id: "SHP-1",
            status: "Assigned",
            fare: 100,
            payments: [{ amount: 100, amountPaid: 100 }],
          },
        ],
      },
    };

    mocks.prisma.sharedTrip.findUnique.mockResolvedValue({
      id: "ST-ABC",
      driverId: "driver-1",
      truckId: "truck-1",
      pickup: "Mogadishu",
      destination: "Baidoa",
      status: "Full",
      totalCapacityTons: 10,
      bookings: [paidBooking],
    });
    mocks.prisma.cargoRequest.update.mockResolvedValue({
      ...paidBooking.cargoRequest,
      weight: "250 kg",
      finalPrice: 100,
    });
    mocks.prisma.trip.findFirst.mockResolvedValue(paidBooking.cargoRequest.trips[0]);
    mocks.prisma.payment.findFirst.mockResolvedValue({
      ...paidBooking.cargoRequest.trips[0].payments[0],
      id: "pay-1",
      amountPaid: 100,
    });
    mocks.prisma.trip.update.mockResolvedValue({});
    mocks.prisma.sharedTripBooking.update.mockResolvedValue({});
    mocks.prisma.truck.update.mockResolvedValue({});
    mocks.prisma.notification.create.mockResolvedValue({});
    mocks.prisma.sharedTrip.update.mockResolvedValue({
      id: "ST-ABC",
      driverId: "driver-1",
      status: "Pickup",
      pickup: "Mogadishu",
      destination: "Baidoa",
      totalCapacityTons: 10,
      availableTons: 0,
      pricePerTon: 20,
      durationAmount: 6,
      durationUnit: "hours",
      departureDate: new Date("2026-08-01"),
      driver: { name: "Hassan" },
      truck: { truckNumber: "TR-2" },
      _count: { bookings: 1 },
    });

    const trip = await sharedTripRepository.startSharedTripPickup("ST-ABC", "driver-1", {
      weightsByBookingId: { b1: 250 },
    });
    expect(trip.status).toBe("Pickup");
  });
});
