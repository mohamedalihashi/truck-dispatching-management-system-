import { prisma } from "../../lib/prisma.js";
import { mapNotification } from "./mappers.js";

export const notificationRepository = {
  async listNotifications({ userId, page = 1, limit = 20 } = {}) {
    if (!userId) {
      return {
        data: [],
        total: 0,
        unreadCount: 0,
        pagination: { page: 1, limit: Number(limit) || 20, total: 0, totalPages: 0 },
      };
    }
    // Strict inbox: each user sees only their own notifications (no null/broadcast rows).
    const where = { userId };
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [data, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip: offset,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, read: false } }),
    ]);

    return {
      data: data.map(mapNotification),
      total,
      unreadCount,
      pagination: {
        page: Math.max(Number(page) || 1, 1),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },

  async markNotificationRead(id, { userId } = {}) {
    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing) return null;
    if (!userId || existing.userId !== userId) {
      const error = new Error("Not allowed to update this notification");
      error.status = 403;
      throw error;
    }
    const notification = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });
    return mapNotification(notification);
  },
};
