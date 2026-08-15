import { prisma } from "../../lib/prisma.js";

function mapContactMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    phone: row.phone,
    message: row.message,
    status: row.status,
    adminNote: row.adminNote || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const contactMessageRepository = {
  async createContactMessage({ name, email, phone, message }) {
    const row = await prisma.contactMessage.create({
      data: {
        name: String(name || "").trim().slice(0, 150),
        email: String(email || "").trim().slice(0, 254) || null,
        phone: String(phone || "").trim().slice(0, 40),
        message: String(message || "").trim().slice(0, 2000),
        status: "Open",
      },
    });
    return mapContactMessage(row);
  },

  async listContactMessages({ status, page = 1, limit = 50 } = {}) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where = status ? { status: String(status) } : {};
    const [rows, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.contactMessage.count({ where }),
    ]);
    return {
      data: rows.map(mapContactMessage),
      total,
      page: Math.max(Number(page) || 1, 1),
      limit: take,
    };
  },

  async updateContactMessageStatus(id, { status, adminNote } = {}) {
    const existing = await prisma.contactMessage.findUnique({ where: { id } });
    if (!existing) return null;
    const row = await prisma.contactMessage.update({
      where: { id },
      data: {
        ...(status ? { status: String(status) } : {}),
        ...(adminNote !== undefined ? { adminNote: String(adminNote || "").slice(0, 1000) || null } : {}),
      },
    });
    return mapContactMessage(row);
  },
};
