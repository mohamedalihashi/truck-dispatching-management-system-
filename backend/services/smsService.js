import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { normalizeSomaliPhone } from "../lib/phone.js";

const MAX_ATTEMPTS = 3;

function looksLikePlaceholder(value = "") {
  return /your[_-]?|replace-with|xxxxx|changeme|example|<|>/i.test(String(value || ""));
}

function providerConfig() {
  const rawUrl = String(process.env.SMS_API_URL || "").trim().replace(/\/+$/, "");
  const baseUrl = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `https://${rawUrl}` : rawUrl;
  const root = baseUrl.replace(/\/sms\/.*$/i, "").replace(/\/+$/, "");
  return {
    root,
    url: baseUrl.includes("/sms/") ? baseUrl : `${root}/sms/3/messages`,
    apiKey: process.env.SMS_API_KEY,
    senderId: process.env.SMS_SENDER_ID || "ServiceSMS",
  };
}

function trialWhitelistHint(description = "") {
  const text = String(description || "");
  if (/whitelist|not registered|sms demo|destination not/i.test(text)) {
    return (
      " Infobip free trial only delivers to verified numbers. " +
      "Add this phone in Infobip portal (Channels → SMS → verified recipients), or upgrade the account to send to any customer."
    );
  }
  return "";
}

async function fetchDeliveryReport(messageId) {
  const config = providerConfig();
  if (!config.root || !config.apiKey || !messageId) return null;
  const response = await fetch(
    `${config.root}/sms/1/reports?messageId=${encodeURIComponent(messageId)}`,
    {
      headers: {
        accept: "application/json",
        authorization: `App ${config.apiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return body.results?.[0] || null;
}

async function reconcileWithDeliveryReport(id, providerMessageId) {
  // Infobip often accepts the request first, then rejects unverified trial destinations.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const report = await fetchDeliveryReport(providerMessageId).catch(() => null);
  if (!report?.status) return null;

  const statusName = String(report.status?.name || report.status?.groupName || "").toUpperCase();
  const groupId = Number(report.status?.groupId || 0);
  const description =
    report.error?.description ||
    report.status?.description ||
    statusName;

  if (statusName.includes("REJECTED") || statusName.includes("UNDELIVERABLE") || groupId === 2 || groupId >= 5) {
    return prisma.smsNotification.update({
      where: { id },
      data: {
        status: "Failed",
        failureReason: `${description}.${trialWhitelistHint(description)}`.slice(0, 1000),
        nextRetryAt: null,
        sentAt: null,
      },
    });
  }

  if (statusName.includes("DELIVERED") || groupId === 3) {
    return prisma.smsNotification.update({
      where: { id },
      data: {
        status: "Sent",
        failureReason: null,
        sentAt: new Date(),
      },
    });
  }

  return null;
}

export function isSmsConfigured() {
  const { url, apiKey } = providerConfig();
  return Boolean(url && apiKey && !looksLikePlaceholder(url) && !looksLikePlaceholder(apiKey));
}

export async function attemptSms(id) {
  const row = await prisma.smsNotification.findUnique({ where: { id } });
  if (!row || row.status === "Sent" || row.attempts >= MAX_ATTEMPTS) return row;
  const config = providerConfig();
  try {
    if (!config.url || !config.apiKey) throw new Error("SMS provider is not configured");
    const to = String(row.recipientPhone || "").replace(/^\+/, "");
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `App ${config.apiKey}`,
      },
      body: JSON.stringify({
        messages: [{
          sender: config.senderId,
          destinations: [{ to }],
          content: { text: row.message },
        }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.requestError?.serviceException?.text || body.message || `SMS provider returned ${response.status}`);
    }
    const providerMessage = body.messages?.[0] || {};
    const statusName = String(providerMessage.status?.name || providerMessage.status?.groupName || "").toUpperCase();
    const statusDescription = String(
      providerMessage.status?.description ||
      providerMessage.status?.groupName ||
      ""
    ).trim();
    if (statusName.includes("REJECTED") || statusName.includes("UNDELIVERABLE") || Number(providerMessage.status?.groupId) >= 5) {
      throw new Error(
        `${statusDescription || `SMS rejected (${statusName || "REJECTED"})`}.${trialWhitelistHint(statusDescription || statusName)}`
      );
    }
    const providerMessageId = String(providerMessage.messageId || body.messageId || body.id || "");
    const accepted = await prisma.smsNotification.update({
      where: { id },
      data: {
        status: "Sent",
        attempts: { increment: 1 },
        providerMessageId,
        failureReason: null,
        nextRetryAt: null,
        sentAt: new Date(),
      },
    });
    const reconciled = providerMessageId
      ? await reconcileWithDeliveryReport(id, providerMessageId)
      : null;
    return reconciled || accepted;
  } catch (error) {
    const attempts = row.attempts + 1;
    return prisma.smsNotification.update({
      where: { id },
      data: {
        status: attempts >= MAX_ATTEMPTS ? "Failed" : "Retrying",
        attempts,
        failureReason: String(error.message || error).slice(0, 1000),
        nextRetryAt: attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + attempts * 5 * 60_000),
      },
    });
  }
}

export async function queueSms({
  entityType,
  entityId,
  event,
  recipientName,
  recipientPhone,
  message,
  sentByUserId = null,
  sentByName = null,
}) {
  if (!recipientPhone) return null;
  const phone = normalizeSomaliPhone(recipientPhone);
  const row = await prisma.smsNotification.upsert({
    where: {
      event_recipientPhone_entityType_entityId: {
        event, recipientPhone: phone, entityType, entityId,
      },
    },
    update: {},
    create: {
      entityType,
      entityId,
      event,
      recipientName: recipientName || null,
      recipientPhone: phone,
      message,
      status: "Pending",
      sentByUserId: sentByUserId || null,
      sentByName: sentByName || "System",
    },
  });
  if (row.status === "Pending" || row.status === "Retrying") {
    void attemptSms(row.id).catch(() => {});
  }
  return row;
}

export async function sendManualSms({
  recipientPhone,
  recipientName,
  message,
  sentByUserId,
  sentByName,
}) {
  const phone = normalizeSomaliPhone(recipientPhone);
  if (!phone) {
    const error = new Error("Valid recipient phone is required");
    error.status = 400;
    throw error;
  }
  const text = String(message || "").trim();
  if (text.length < 1) {
    const error = new Error("Message is required");
    error.status = 400;
    throw error;
  }
  const row = await prisma.smsNotification.create({
    data: {
      entityType: "manual",
      entityId: crypto.randomUUID(),
      event: "manual.send",
      recipientName: recipientName?.trim() || null,
      recipientPhone: phone,
      message: text.slice(0, 1000),
      status: "Pending",
      sentByUserId: sentByUserId || null,
      sentByName: sentByName || null,
    },
  });
  return attemptSms(row.id);
}

export async function retryDueSms() {
  const due = await prisma.smsNotification.findMany({
    where: {
      status: "Retrying",
      nextRetryAt: { lte: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    },
    take: 25,
    orderBy: { nextRetryAt: "asc" },
  });
  return Promise.all(due.map((row) => attemptSms(row.id)));
}

export async function resendSms(id) {
  const row = await prisma.smsNotification.update({
    where: { id },
    data: { status: "Pending", attempts: 0, failureReason: null, nextRetryAt: null },
  });
  return attemptSms(row.id);
}

export async function listSmsNotifications({ status, page = 1, limit = 50 } = {}) {
  const where = status ? { status } : {};
  const [data, total] = await Promise.all([
    prisma.smsNotification.findMany({
      where,
      include: { sentBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
    prisma.smsNotification.count({ where }),
  ]);
  return {
    data: data.map((row) => {
      const { sentBy, ...rest } = row;
      return {
        ...rest,
        sentByName: rest.sentByName || sentBy?.name || "System",
      };
    }),
    total,
    page: Number(page),
  };
}
