import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { ADMIN, DEMO_PASSWORD } from "../config/seed.js";
import { notificationRepository } from "./db/notificationRepository.js";
import { settingsRepository } from "./db/settingsRepository.js";
import { verificationRepository } from "./db/verificationRepository.js";
import { auditRepository } from "./db/auditRepository.js";
import { paymentRepository } from "./db/paymentRepository.js";
import { userRepository } from "./db/userRepository.js";
import { truckRepository } from "./db/truckRepository.js";
import { cargoRepository } from "./db/cargoRepository.js";
import { tripRepository } from "./db/tripRepository.js";
import { reportRepository } from "./db/reportRepository.js";
import { supportComplaintRepository } from "./db/supportComplaintRepository.js";
import { bidRepository } from "./db/bidRepository.js";
import { sharedTripRepository } from "./db/sharedTripRepository.js";
import { phoneBookingRepository } from "./db/phoneBookingRepository.js";

// ─── DB Service ──────────────────────────────────────────────────────

export { prisma } from "../lib/prisma.js";

export const db = {
  ...notificationRepository,
  ...settingsRepository,
  ...verificationRepository,
  ...auditRepository,
  ...paymentRepository,
  ...userRepository,
  ...truckRepository,
  ...cargoRepository,
  ...tripRepository,
  ...reportRepository,
  ...supportComplaintRepository,
  ...bidRepository,
  ...sharedTripRepository,
  ...phoneBookingRepository,

  async ensureAdmin() {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: ADMIN.email, mode: "insensitive" } },
      select: { id: true, role: true, status: true, name: true, phone: true, isSuperAdmin: true },
    });

    if (existing) {
      const needsUpdate =
        existing.role !== ADMIN.role ||
        existing.status !== "Active" ||
        !existing.isSuperAdmin ||
        existing.name !== ADMIN.name ||
        existing.phone !== ADMIN.phone;

      if (needsUpdate) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            role: ADMIN.role,
            status: "Active",
            name: ADMIN.name,
            phone: ADMIN.phone,
            isSuperAdmin: true,
          },
        });
      }

      return { password: DEMO_PASSWORD, email: ADMIN.email };
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await prisma.user.create({
      data: {
        ...ADMIN,
        isSuperAdmin: true,
        passwordHash,
      },
    });
    return { password: DEMO_PASSWORD, email: ADMIN.email };
  },

  async seedIfEmpty() {
    const count = await prisma.user.count();
    if (count > 0) return { seeded: false };

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await prisma.user.create({
      data: { ...ADMIN, isSuperAdmin: true, passwordHash },
    });

    return { seeded: true, demoPassword: DEMO_PASSWORD };
  },


};
