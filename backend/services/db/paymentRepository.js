import { prisma } from "../../lib/prisma.js";
import { paymentSchedule } from "../../lib/paymentWorkflow.js";
import {
  buildWaafiAttemptReference,
  buildWaafiReferenceId,
  formatWaafiError,
  isWaafiSuccess,
  waafiPurchase,
} from "../waafiPayService.js";
import { getCommissionSettings, syncEarningsForPayment } from "../commissionService.js";

const paymentInclude = {
  customer: true,
  trip: {
    include: {
      cargoRequest: { select: { id: true, loadType: true } },
    },
  },
};

function isSharedPayment(row) {
  return row?.trip?.cargoRequest?.loadType === "SHARED";
}

export const paymentRepository = {
mapPayment(row, customerName) {
  if (!row) return null;
  const amount = Number(row.amount);
  const amountPaid = Number(row.amountPaid || 0);
  const fullPaymentOnce = isSharedPayment(row);
  const schedule = paymentSchedule({
    amount,
    amountPaid,
    deliveryConfirmedAt: row.trip?.deliveryConfirmedAt,
    fullPaymentOnce,
  });
  return {
    id: row.id,
    tripId: row.tripId,
    customerId: row.customerId,
    customer: customerName ?? row.customer?.name,
    amount,
    amountPaid,
    balanceDue: Math.max(0, amount - amountPaid),
    depositAmount: schedule.depositAmount,
    requiredPaymentAmount: schedule.requiredAmount,
    paymentStage: schedule.stage,
    canPay: schedule.canPay,
    fullPaymentOnce,
    loadType: row.trip?.cargoRequest?.loadType || null,
    deliveryConfirmedAt: row.trip?.deliveryConfirmedAt || null,
    status: row.status,
    method: row.method,
    currency: row.currency,
    referenceId: row.referenceId,
    description: row.description,
    provider: row.provider,
    providerTransactionId: row.providerTransactionId,
    createdAt: row.createdAt,
  };
},

async getPaymentById(id) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: paymentInclude,
  });
  return payment ? this.mapPayment(payment) : null;
},

async processWaafiPayment({ paymentId, accountNo, customerId, actorId, payAmount }) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: paymentInclude,
  });

  if (!payment) {
    const error = new Error("Payment not found");
    error.status = 404;
    throw error;
  }
  if (payment.customerId !== customerId) {
    const error = new Error("Not authorized to pay this invoice");
    error.status = 403;
    throw error;
  }

  const totalDue = Number(payment.amount);
  const alreadyPaid = Number(payment.amountPaid || 0);
  const balanceDue = Math.max(0, totalDue - alreadyPaid);
  const fullPaymentOnce = isSharedPayment(payment);

  if (payment.status === "Paid" || balanceDue <= 0) {
    const error = new Error("This payment is already completed");
    error.status = 409;
    throw error;
  }

  const chargeAmount =
    payAmount != null && payAmount !== "" ? Number(payAmount) : balanceDue;
  if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
    const error = new Error("Enter a valid payment amount greater than zero");
    error.status = 400;
    throw error;
  }
  if (chargeAmount > balanceDue + 0.01) {
    const error = new Error(`You can pay at most ${balanceDue.toFixed(2)} (remaining balance)`);
    error.status = 400;
    throw error;
  }
  const schedule = paymentSchedule({
    amount: totalDue,
    amountPaid: alreadyPaid,
    deliveryConfirmedAt: payment.trip?.deliveryConfirmedAt,
    fullPaymentOnce,
  });
  const requiredAmount = schedule.requiredAmount;
  if (!fullPaymentOnce && alreadyPaid > 0 && !payment.trip?.deliveryConfirmedAt) {
    const error = new Error("The remaining 70% can only be paid after proof of delivery and customer confirmation");
    error.status = 409;
    throw error;
  }
  if (Math.abs(chargeAmount - requiredAmount) > 0.01) {
    const stage = fullPaymentOnce
      ? "full shared-trip payment"
      : alreadyPaid <= 0
        ? "30% deposit"
        : "remaining 70% balance";
    const error = new Error(`This payment must be the exact ${stage}: ${requiredAmount.toFixed(2)}`);
    error.status = 400;
    throw error;
  }

  const referenceId = buildWaafiAttemptReference(paymentId);
  const invoiceId = buildWaafiReferenceId(payment.tripId || payment.id);
  const description =
    payment.description ||
    (payment.trip
      ? `Trip ${payment.tripId} — ${payment.trip.pickup} to ${payment.trip.destination}`
      : "GaariHel shipment payment");

  const { response, currency } = await waafiPurchase({
    accountNo,
    referenceId,
    invoiceId,
    amount: chargeAmount,
    description,
  });

  if (isWaafiSuccess(response)) {
    const newAmountPaid = alreadyPaid + chargeAmount;
    const newStatus = newAmountPaid >= totalDue - 0.01 ? "Paid" : "Partial";

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        amountPaid: newAmountPaid,
        method: "waafipay",
        provider: "waafipay",
        currency,
        referenceId,
        description,
        providerTransactionId: response.params?.transactionId
          ? String(response.params.transactionId)
          : null,
        providerResponse: response,
      },
      include: paymentInclude,
    });

    if (alreadyPaid <= 0 && payment.tripId) {
      await prisma.trip.update({
        where: { id: payment.tripId },
        data: { status: "Assigned" },
      });
      if (payment.trip?.cargoRequestId) {
        await prisma.cargoRequest.update({
          where: { id: payment.trip.cargoRequestId },
          data: { status: "Assigned" },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: "payment.waafipay.completed",
        entityType: "payment",
        entityId: paymentId,
        meta: {
          transactionId: response.params?.transactionId,
          referenceId,
          chargeAmount,
          amountPaid: newAmountPaid,
          totalDue,
          fullPaymentOnce,
        },
      },
    });

    const customerNotification = await prisma.notification.create({
      data: {
        userId: customerId,
        type: "payment.completed",
        message: `Payment of ${chargeAmount.toFixed(2)} ${currency} received for ${payment.tripId || "shipment"}.`,
      },
    });

    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      select: { id: true },
    });
    const customerName = payment.customer?.name || "Customer";
    const adminNotifications = await Promise.all(
      admins.map((admin) =>
        prisma.notification.create({
          data: {
            userId: admin.id,
            type: "payment.received",
            message: `${customerName} paid ${chargeAmount.toFixed(2)} ${currency} via Waafi (${newStatus}).`,
          },
        })
      )
    );

    const earnings = newStatus === "Paid" ? await syncEarningsForPayment(paymentId) : [];

    return {
      payment: this.mapPayment(updated),
      notification: customerNotification,
      adminNotifications,
      earnings,
    };
  }

  console.error("WaafiPay declined:", JSON.stringify(response));

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      method: "waafipay",
      provider: "waafipay",
      currency,
      referenceId,
      description,
      providerResponse: response,
    },
  });

  const error = new Error(formatWaafiError(response));
  error.status = 402;
  error.details = response;
  throw error;
},

async createPayment({ tripId, customerId, amount, status = "Pending", method = "waafipay", description }) {
  const data = {
    customer: { connect: { id: customerId } },
    amount,
    amountPaid: status === "Paid" ? amount : 0,
    status,
    method,
    provider: method === "waafipay" ? "waafipay" : null,
    currency: process.env.WAAFI_CURRENCY || "SLSH",
  };
  if (description) data.description = description;
  if (tripId) {
    data.trip = { connect: { id: tripId } };
  }

  const payment = await prisma.payment.create({ data });
  if (Number(payment.amountPaid) > 0) {
    await syncEarningsForPayment(payment.id);
  }
  const customer = await prisma.user.findUnique({ where: { id: payment.customerId } });
  return this.mapPayment(payment, customer?.name);
},

async deletePayment(id) {
  const result = await prisma.payment.deleteMany({ where: { id } });
  return result.count > 0;
},

async updatePayment(id, { status, amount, description, amountPaid, method }) {
  const existing = await prisma.payment.findUnique({ where: { id } });
  if (!existing) return null;

  const data = {};
  if (status != null) data.status = status;
  if (amount != null) data.amount = amount;
  if (description != null) data.description = description;
  if (method != null) data.method = method;
  if (amountPaid != null) {
    data.amountPaid = amountPaid;
  } else if (status === "Paid") {
    data.amountPaid = amount != null ? amount : existing.amount;
  } else if (status === "Pending") {
    data.amountPaid = 0;
  }

  if (status === "Paid" && data.amountPaid == null) {
    data.amountPaid = amount != null ? amount : existing.amount;
  }

  const payment = await prisma.payment.update({
    where: { id },
    data,
    include: paymentInclude,
  }).catch(() => null);

  if (!payment) return null;
  await syncEarningsForPayment(id);
  return this.mapPayment(payment);
},

async updateCustomerPayment(id, { amount, description, customerId }) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) {
    const error = new Error("Payment not found");
    error.status = 404;
    throw error;
  }
  if (payment.customerId !== customerId) {
    const error = new Error("Not authorized to edit this payment");
    error.status = 403;
    throw error;
  }
  if (payment.status === "Paid") {
    const error = new Error("Completed payments cannot be edited");
    error.status = 409;
    throw error;
  }
  if (Number(payment.amountPaid || 0) > 0) {
    const error = new Error("Cannot change invoice after a partial payment was made");
    error.status = 409;
    throw error;
  }

  const data = {};
  if (amount != null) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      const error = new Error("Amount must be greater than zero");
      error.status = 400;
      throw error;
    }
    data.amount = numericAmount;
  }
  if (description != null) data.description = description;

  const updated = await prisma.payment.update({
    where: { id },
    data,
    include: paymentInclude,
  });

  return this.mapPayment(updated);
},

async listPayments({ page = 1, limit = 50, customerId } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const where = customerId ? { customerId } : {};
  const data = await prisma.payment.findMany({
    where,
    include: paymentInclude,
    orderBy: { createdAt: "desc" },
    take: Number(limit),
    skip: offset,
  });
  return {
    data: data.map((row) => this.mapPayment(row)),
    total: data.length,
  };
},

// ── Earnings & payouts ───────────────────────────────────────────

mapEarning(row) {
  if (!row) return null;
  return {
    id: row.id,
    paymentId: row.paymentId,
    tripId: row.tripId,
    recipientId: row.recipientId,
    recipient: row.recipient?.name || (row.recipientRole === "platform" ? "Platform" : null),
    recipientRole: row.recipientRole,
    amount: Number(row.amount),
    percent: Number(row.percent),
    currency: row.currency,
    status: row.status,
    payoutMethod: row.payoutMethod,
    payoutReference: row.payoutReference,
    paidOutAt: row.paidOutAt,
    createdAt: row.createdAt,
  };
},

async listEarnings({ recipientId, recipientRole, status, page = 1, limit = 50 } = {}) {
  const where = {};
  if (recipientId) where.recipientId = recipientId;
  if (recipientRole) where.recipientRole = recipientRole;
  if (status) where.status = status;

  const offset = (Number(page) - 1) * Number(limit);
  const data = await prisma.earning.findMany({
    where,
    include: { recipient: true },
    orderBy: { createdAt: "desc" },
    take: Number(limit),
    skip: offset,
  });

  return {
    data: data.map((row) => this.mapEarning(row)),
    total: data.length,
  };
},

async getEarningsSummary({ userId, role } = {}) {
  if (role === "admin") {
    const [platformAvailable, platformPaid, driverPending, dispatcherPending] = await Promise.all([
      prisma.earning.aggregate({
        where: { recipientRole: "platform", status: "Available" },
        _sum: { amount: true },
      }),
      prisma.earning.aggregate({
        where: { recipientRole: "platform", status: "PaidOut" },
        _sum: { amount: true },
      }),
      prisma.earning.aggregate({
        where: { recipientRole: "driver", status: "Available" },
        _sum: { amount: true },
      }),
      prisma.earning.aggregate({
        where: { recipientRole: "dispatcher", status: "Available" },
        _sum: { amount: true },
      }),
    ]);

    return {
      platformAvailable: Number(platformAvailable._sum.amount || 0),
      platformPaidOut: Number(platformPaid._sum.amount || 0),
      driverOwed: Number(driverPending._sum.amount || 0),
      dispatcherOwed: Number(dispatcherPending._sum.amount || 0),
      commission: await getCommissionSettings(),
    };
  }

  const where = { recipientId: userId };
  const [available, paidOut, total] = await Promise.all([
    prisma.earning.aggregate({
      where: { ...where, status: "Available" },
      _sum: { amount: true },
    }),
    prisma.earning.aggregate({
      where: { ...where, status: "PaidOut" },
      _sum: { amount: true },
    }),
    prisma.earning.aggregate({
      where,
      _sum: { amount: true },
    }),
  ]);

  return {
    available: Number(available._sum.amount || 0),
    paidOut: Number(paidOut._sum.amount || 0),
    totalEarned: Number(total._sum.amount || 0),
    commission: await getCommissionSettings(),
  };
},

async payoutEarning(id, { actorId, payoutMethod = "manual", payoutReference }) {
  const earning = await prisma.earning.findUnique({
    where: { id },
    include: { recipient: true },
  });

  if (!earning) {
    const error = new Error("Earning not found");
    error.status = 404;
    throw error;
  }
  if (earning.status === "PaidOut") {
    const error = new Error("This earning is already paid out");
    error.status = 409;
    throw error;
  }
  if (earning.recipientRole === "platform") {
    const error = new Error("Platform earnings are kept by admin — no payout needed");
    error.status = 400;
    throw error;
  }

  const updated = await prisma.earning.update({
    where: { id },
    data: {
      status: "PaidOut",
      payoutMethod,
      payoutReference: payoutReference || null,
      paidOutAt: new Date(),
    },
    include: { recipient: true },
  });

  if (updated.recipientId) {
    await prisma.notification.create({
      data: {
        userId: updated.recipientId,
        type: "earning.paid",
        message: `Payout of ${Number(updated.amount).toFixed(2)} ${updated.currency || "SLSH"} sent (${payoutMethod}).`,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: "earning.paid_out",
      entityType: "earning",
      entityId: id,
      meta: {
        recipientId: updated.recipientId,
        amount: Number(updated.amount),
        payoutMethod,
      },
    },
  });

  return this.mapEarning(updated);
},

async payoutUserEarnings({ userId, actorId, payoutMethod = "manual", payoutReference }) {
  const available = await prisma.earning.findMany({
    where: { recipientId: userId, status: "Available" },
  });

  if (!available.length) {
    const error = new Error("No available earnings to pay out");
    error.status = 404;
    throw error;
  }

  const results = [];
  for (const earning of available) {
    results.push(
      await this.payoutEarning(earning.id, { actorId, payoutMethod, payoutReference })
    );
  }
  return results;
},

};
