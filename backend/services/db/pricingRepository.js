import { prisma } from "../../lib/prisma.js";
import { auditFields } from "../../lib/auditContext.js";
import {
  DEFAULT_PRICING,
  applyPriceAdjustment,
  calculateTransportPrice,
  estimateDistanceKm,
  estimateEtaLabel,
  mapPricingSettings,
  parseWeightTons,
} from "../pricingService.js";
import { mapCargoRequest, cargoRequestInclude } from "./mappers.js";

export const pricingRepository = {
  async getPricingSettings() {
    const row = await prisma.pricingSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default", ...DEFAULT_PRICING },
    });
    return mapPricingSettings(row);
  },

  async updatePricingSettings(payload, { actorId } = {}) {
    const data = {
      baseFee: Number(payload.baseFee),
      pricePerKm: Number(payload.pricePerKm),
      pricePerTon: Number(payload.pricePerTon),
      minimumCharge: Number(payload.minimumCharge),
      maximumCharge:
        payload.maximumCharge == null || payload.maximumCharge === ""
          ? null
          : Number(payload.maximumCharge),
      automaticPricing: Boolean(payload.automaticPricing),
    };

    for (const [key, value] of Object.entries(data)) {
      if (key === "maximumCharge" && value == null) continue;
      if (key === "automaticPricing") continue;
      if (!Number.isFinite(value) || value < 0) {
        const error = new Error(`${key} must be a non-negative number`);
        error.status = 400;
        throw error;
      }
    }
    if (data.maximumCharge != null && data.maximumCharge < data.minimumCharge) {
      const error = new Error("Maximum charge cannot be less than minimum charge");
      error.status = 400;
      throw error;
    }

    const previous = await this.getPricingSettings();
    const row = await prisma.pricingSettings.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
    });

    await prisma.auditLog.create({
      data: auditFields({
        userId: actorId,
        action: "pricing.updated",
        entityType: "pricing_settings",
        entityId: "default",
        description: "Admin updated transport pricing settings",
        oldValues: previous,
        newValues: mapPricingSettings(row),
      }),
    });

    return mapPricingSettings(row);
  },

  async estimateTransportPrice({
    pickup,
    destination,
    weight,
    fromRegion,
    fromDistrict,
    toRegion,
    toDistrict,
  }) {
    const settings = await this.getPricingSettings();
    const distanceKm = estimateDistanceKm(pickup, destination, {
      fromRegion,
      fromDistrict,
      toRegion,
      toDistrict,
    });
    const calc = calculateTransportPrice({
      distanceKm,
      weightTons: parseWeightTons(weight),
      ...settings,
    });
    return {
      ...calc,
      estimatedTime: estimateEtaLabel(calc.distanceKm),
      rates: {
        baseFee: settings.baseFee,
        pricePerKm: settings.pricePerKm,
        pricePerTon: settings.pricePerTon,
        minimumCharge: settings.minimumCharge,
        maximumCharge: settings.maximumCharge,
      },
    };
  },

  async calculateQuotePrice(id, { actorId, force = false } = {}) {
    const existing = await prisma.cargoRequest.findUnique({
      where: { id },
      include: cargoRequestInclude,
    });
    if (!existing) return null;

    const settings = await this.getPricingSettings();
    if (!settings.automaticPricing && !force) {
      const error = new Error("Automatic pricing is disabled. Enable it in Pricing Settings or set a fixed price manually.");
      error.status = 400;
      throw error;
    }

    const distanceKm = estimateDistanceKm(existing.pickup, existing.destination);
    const weightTons = parseWeightTons(existing.weight);
    const calc = calculateTransportPrice({
      distanceKm,
      weightTons,
      ...settings,
    });

    const updated = await prisma.cargoRequest.update({
      where: { id },
      data: {
        distanceKm: calc.distanceKm,
        calculatedPrice: calc.calculatedPrice,
        finalPrice: calc.calculatedPrice,
        adjustmentType: null,
        adjustmentAmount: null,
        adjustmentReason: null,
        approvedByDispatcher: null,
        approvedAt: null,
      },
      include: cargoRequestInclude,
    });

    await prisma.auditLog.create({
      data: auditFields({
        userId: actorId,
        action: "pricing.calculated",
        entityType: "cargo_requests",
        entityId: id,
        description: `Auto-calculated transport price ${calc.calculatedPrice}`,
        newValues: {
          distanceKm: calc.distanceKm,
          calculatedPrice: calc.calculatedPrice,
          breakdown: calc.breakdown,
        },
      }),
    });

    return {
      request: mapCargoRequest(updated),
      calculation: calc,
      settings,
    };
  },

  async adjustQuotePrice(id, { adjustmentType, adjustmentAmount, adjustmentReason, actorId }) {
    const existing = await prisma.cargoRequest.findUnique({
      where: { id },
      include: cargoRequestInclude,
    });
    if (!existing) return null;

    const status = String(existing.status).replace(/_/g, " ");
    if (!["Pending", "Quote Rejected"].includes(status)) {
      const error = new Error("Price can only be adjusted before the quote is sent to the customer");
      error.status = 400;
      throw error;
    }

    let calculated = existing.calculatedPrice != null ? Number(existing.calculatedPrice) : null;
    let distanceKm = existing.distanceKm != null ? Number(existing.distanceKm) : null;

    if (calculated == null) {
      const result = await this.calculateQuotePrice(id, { actorId, force: true });
      calculated = result.calculation.calculatedPrice;
      distanceKm = result.calculation.distanceKm;
    }

    const applied = applyPriceAdjustment({
      calculatedPrice: calculated,
      adjustmentType,
      adjustmentAmount,
    });

    if (applied.changed) {
      if (!adjustmentReason?.trim()) {
        const error = new Error("Adjustment reason is required when the final price differs from the calculated price");
        error.status = 400;
        throw error;
      }
    }

    const updated = await prisma.cargoRequest.update({
      where: { id },
      data: {
        distanceKm,
        calculatedPrice: applied.calculatedPrice,
        adjustmentType: applied.changed ? adjustmentType : null,
        adjustmentAmount: applied.changed ? applied.adjustmentAmount : null,
        adjustmentReason: applied.changed ? adjustmentReason.trim() : null,
        finalPrice: applied.finalPrice,
        approvedByDispatcher: actorId,
        approvedAt: new Date(),
      },
      include: cargoRequestInclude,
    });

    await prisma.auditLog.create({
      data: auditFields({
        userId: actorId,
        action: "pricing.adjusted",
        entityType: "cargo_requests",
        entityId: id,
        description: applied.changed
          ? `Dispatcher adjusted price to ${applied.finalPrice} (${adjustmentType})`
          : "Dispatcher accepted calculated price",
        oldValues: {
          calculatedPrice: calculated,
          finalPrice: existing.finalPrice != null ? Number(existing.finalPrice) : null,
        },
        newValues: {
          calculatedPrice: applied.calculatedPrice,
          adjustmentType: updated.adjustmentType,
          adjustmentAmount: updated.adjustmentAmount != null ? Number(updated.adjustmentAmount) : null,
          adjustmentReason: updated.adjustmentReason,
          finalPrice: applied.finalPrice,
        },
      }),
    });

    return mapCargoRequest(updated);
  },
};
