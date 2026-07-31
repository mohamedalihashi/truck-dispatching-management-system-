import { prisma } from "../../lib/prisma.js";
import { auditFields } from "../../lib/auditContext.js";

export const auditRepository = {
  async recordAudit(payload) {
    return prisma.auditLog.create({ data: auditFields(payload) });
  },

  async listAuditLogs({ page = 1, limit = 50 } = {}) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take,
        skip: offset,
      }),
      prisma.auditLog.count(),
    ]);

    return {
      data: data.map((row) => ({
        id: row.id,
        userId: row.userId,
        actor: row.user?.name,
        action: row.action,
        entity: row.entityType,
        entityId: row.entityId,
        meta: row.meta,
        createdAt: row.createdAt,
      })),
      total,
      pagination: {
        page: Math.max(Number(page) || 1, 1),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },
};
