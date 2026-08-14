import { prisma } from "../lib/prisma.js";

export const DEFAULT_COMMISSION = {
  driver: 90,
  dispatcher: 0,
  platform: 10,
};

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

export async function getCommissionSettings() {
  const row = await prisma.setting.findUnique({ where: { key: "commission" } });
  const value = row?.value || DEFAULT_COMMISSION;
  let driver = Number(value.driver ?? DEFAULT_COMMISSION.driver);
  let dispatcher = Number(value.dispatcher ?? DEFAULT_COMMISSION.dispatcher);
  let platform = Number(value.platform ?? DEFAULT_COMMISSION.platform);

  // No separate dispatcher role — that share belongs to the platform (admin).
  if (dispatcher > 0) {
    platform += dispatcher;
    dispatcher = 0;
  }

  const total = driver + dispatcher + platform;
  if (total <= 0) return { ...DEFAULT_COMMISSION };
  return { driver, dispatcher, platform };
}

export async function getDistributedAmountForPayment(paymentId) {
  const result = await prisma.earning.aggregate({
    where: { paymentId },
    _sum: { amount: true },
  });
  return Number(result._sum.amount || 0);
}

export async function distributePaymentEarnings({
  paymentId,
  tripId,
  chargeAmount,
  currency = "SLSH",
}) {
  const amount = roundMoney(chargeAmount);
  if (amount <= 0) return [];

  const commission = await getCommissionSettings();
  const trip = tripId
    ? await prisma.trip.findUnique({
        where: { id: tripId },
        include: { driver: true, dispatcher: true },
      })
    : null;

  const totalPct = commission.driver + commission.dispatcher + commission.platform;
  let driverAmount = 0;
  let dispatcherAmount = 0;
  let platformAmount = amount;

  if (trip?.driverId) {
    driverAmount = roundMoney((amount * commission.driver) / totalPct);
    platformAmount = roundMoney(platformAmount - driverAmount);
  }
  if (trip?.dispatcherId) {
    dispatcherAmount = roundMoney((amount * commission.dispatcher) / totalPct);
    platformAmount = roundMoney(platformAmount - dispatcherAmount);
  }
  if (platformAmount < 0) platformAmount = 0;

  const rows = [];
  const base = {
    paymentId,
    tripId: tripId || null,
    currency,
    status: "Available",
  };

  if (trip?.driverId && driverAmount > 0) {
    rows.push({
      ...base,
      recipientId: trip.driverId,
      recipientRole: "driver",
      amount: driverAmount,
      percent: commission.driver,
    });
  }
  if (trip?.dispatcherId && dispatcherAmount > 0) {
    rows.push({
      ...base,
      recipientId: trip.dispatcherId,
      recipientRole: "dispatcher",
      amount: dispatcherAmount,
      percent: commission.dispatcher,
    });
  }
  if (platformAmount > 0) {
    rows.push({
      ...base,
      recipientId: null,
      recipientRole: "platform",
      amount: platformAmount,
      percent: commission.platform,
    });
  }

  if (!rows.length) {
    rows.push({
      ...base,
      recipientId: null,
      recipientRole: "platform",
      amount,
      percent: 100,
    });
  }

  const created = [];
  for (const row of rows) {
    const earning = await prisma.earning.create({
      data: row,
      include: { recipient: true, trip: true },
    });
    created.push(earning);

    if (earning.recipientId) {
      const roleLabel = earning.recipientRole === "driver" ? "Driver" : "Dispatcher";
      await prisma.notification.create({
        data: {
          userId: earning.recipientId,
          type: "earning.created",
          message: `${roleLabel} earning: ${Number(earning.amount).toFixed(2)} ${currency} from trip ${tripId || "payment"}.`,
        },
      });
    }
  }

  return created;
}

export async function syncEarningsForPayment(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { trip: true },
  });
  if (!payment) return [];
  if (payment.status !== "Paid" || Number(payment.amountPaid || 0) < Number(payment.amount || 0) - 0.01) {
    return [];
  }

  const amountPaid = Number(payment.amountPaid || 0);
  const alreadyDistributed = await getDistributedAmountForPayment(paymentId);
  const delta = roundMoney(amountPaid - alreadyDistributed);
  if (delta <= 0) return [];

  return distributePaymentEarnings({
    paymentId,
    tripId: payment.tripId,
    chargeAmount: delta,
    currency: payment.currency || process.env.WAAFI_CURRENCY || "SLSH",
  });
}
