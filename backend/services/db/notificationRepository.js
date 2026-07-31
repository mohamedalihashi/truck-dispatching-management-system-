import { prisma } from "../../lib/prisma.js";
import { mapNotification } from "./mappers.js";

export const notificationRepository = {
  async listNotifications({ userId, page = 1, limit = 20 } = {}) {
    const where = {};
    if (userId) {
      where.OR = [{ userId }, { userId: null }];
    }
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

  async markNotificationRead(id) {
    const notification = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });
    return mapNotification(notification);
  },
};
