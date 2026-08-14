import { prisma } from "../../lib/prisma.js";
import { auditFields } from "../../lib/auditContext.js";

function mapComplaint(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer?.name || null,
    againstRole: row.againstRole,
    againstUserId: row.againstUserId,
    againstName: row.againstName || row.againstUser?.name || null,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    subject: row.subject,
    message: row.message,
    status: row.status,
    adminNote: row.adminNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const complaintInclude = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  againstUser: { select: { id: true, name: true, role: true } }
};

async function resolveReferenceForCustomer(referenceId, customerId) {
  const id = String(referenceId || "").trim();
  if (!id) return null;

  const trip = await prisma.trip.findFirst({
    where: { id, customerId },
    include: {
      driver: { select: { id: true, name: true } },
      dispatcher: { select: { id: true, name: true } }
    }
  });
  if (trip) {
    return {
      referenceType: "trip",
      referenceId: trip.id,
      driver: trip.driver,
      dispatcher: trip.dispatcher
    };
  }

  const request = await prisma.cargoRequest.findFirst({
    where: { id, customerId },
    include: {
      driver: { select: { id: true, name: true } },
      dispatcher: { select: { id: true, name: true } }
    }
  });
  if (request) {
    return {
      referenceType: "cargo_request",
      referenceId: request.id,
      driver: request.driver,
      dispatcher: request.dispatcher
    };
  }

  return null;
}

export const supportComplaintRepository = {
  async createSupportComplaint({ customerId, againstRole, referenceId, subject, message, actorId }) {
    const role = String(againstRole || "").toLowerCase();
    if (!["driver", "dispatcher", "platform"].includes(role)) {
      const error = new Error("You can only complain about a driver, dispatcher, or platform support");
      error.status = 400;
      throw error;
    }
    const text = String(message || "").trim();
    if (text.length < 10) {
      const error = new Error("Please describe the issue in at least 10 characters");
      error.status = 400;
      throw error;
    }

    let againstUserId = null;
    let againstName = null;
    let referenceType = "general";
    let resolvedReferenceId = String(referenceId || "").trim() || "GENERAL";

    if (role === "platform") {
      againstName = "Platform support";
      if (referenceId) {
        const resolved = await resolveReferenceForCustomer(referenceId, customerId);
        if (resolved) {
          referenceType = resolved.referenceType;
          resolvedReferenceId = resolved.referenceId;
        }
      }
    } else {
      const resolved = await resolveReferenceForCustomer(referenceId, customerId);
      if (!resolved) {
        const error = new Error("Trip or request ID not found for your account. Check the ID and try again.");
        error.status = 404;
        throw error;
      }
      referenceType = resolved.referenceType;
      resolvedReferenceId = resolved.referenceId;
      const target = role === "driver" ? resolved.driver : resolved.dispatcher;
      if (!target?.id) {
        const error = new Error(
          role === "driver"
            ? "No driver is assigned on this trip/request yet"
            : "No dispatcher is linked to this trip/request yet"
        );
        error.status = 400;
        throw error;
      }
      againstUserId = target.id;
      againstName = target.name;
    }

    const row = await prisma.supportComplaint.create({
      data: {
        customerId,
        againstRole: role,
        againstUserId,
        againstName,
        referenceType,
        referenceId: resolvedReferenceId,
        subject: String(subject || "").trim() || `Complaint about ${role}`,
        message: text.slice(0, 2000),
        status: "Open"
      },
      include: complaintInclude
    });

    await prisma.auditLog.create({
      data: auditFields({
        userId: actorId || customerId,
        action: "support.complaint.created",
        entityType: "support_complaints",
        entityId: row.id,
        description: `Customer complaint against ${role} on ${resolvedReferenceId}`,
        newValues: {
          againstRole: role,
          againstUserId,
          referenceId: resolvedReferenceId
        }
      })
    });

    if (againstUserId) {
      await prisma.notification.create({
        data: {
          userId: againstUserId,
          type: "support.complaint",
          message: `A customer filed a support complaint about you on ${resolvedReferenceId}.`
        }
      });
    } else {
      const admins = await prisma.user.findMany({
        where: { role: "admin", status: "Active" },
        select: { id: true },
        take: 20
      });
      if (admins.length) {
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: "support.complaint",
            message: `New customer support complaint on ${resolvedReferenceId}.`
          }))
        });
      }
    }

    return mapComplaint(row);
  },

  async listSupportComplaints({ customerId, status, page = 1, limit = 50 } = {}) {
    const where = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    const [data, total] = await Promise.all([
      prisma.supportComplaint.findMany({
        where,
        include: complaintInclude,
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      }),
      prisma.supportComplaint.count({ where })
    ]);
    return { data: data.map(mapComplaint), total, page: Number(page) };
  },

  async updateSupportComplaintStatus(id, { status, adminNote, actorId }) {
    const allowed = ["Open", "In Review", "Resolved", "Closed"];
    if (!allowed.includes(status)) {
      const error = new Error("Invalid complaint status");
      error.status = 400;
      throw error;
    }
    const existing = await prisma.supportComplaint.findUnique({ where: { id } });
    if (!existing) return null;

    const row = await prisma.supportComplaint.update({
      where: { id },
      data: {
        status,
        adminNote: adminNote?.trim() || existing.adminNote
      },
      include: complaintInclude
    });

    await prisma.auditLog.create({
      data: auditFields({
        userId: actorId,
        action: "support.complaint.updated",
        entityType: "support_complaints",
        entityId: id,
        description: `Complaint status set to ${status}`,
        oldValues: { status: existing.status },
        newValues: { status }
      })
    });

    return mapComplaint(row);
  }
};
