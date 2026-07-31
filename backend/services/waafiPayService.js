import crypto from "node:crypto";

function waafiTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function getConfig() {
  const merchantUid = process.env.WAAFI_MERCHANT_UID;
  const apiUserId = process.env.WAAFI_API_USER_ID;
  const apiKey = process.env.WAAFI_API_KEY;
  const apiUrl = process.env.WAAFI_API_URL || "https://api.waafipay.net/asm";
  const currency = process.env.WAAFI_CURRENCY || "SLSH";
  const placeholder = /your[_-]?|replace-with|xxxxx|changeme|example|<|>/i;

  if (
    !merchantUid ||
    !apiUserId ||
    !apiKey ||
    placeholder.test(merchantUid) ||
    placeholder.test(apiUserId) ||
    placeholder.test(apiKey)
  ) {
    const error = new Error("WaafiPay is not configured on the server");
    error.status = 503;
    throw error;
  }

  return { merchantUid, apiUserId, apiKey, apiUrl, currency };
}

export function normalizeWaafiAccountNo(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `252${digits.slice(1)}`;
  if (!digits.startsWith("252")) {
    throw Object.assign(new Error("Mobile number must start with 252 (Somalia)"), { status: 400 });
  }
  if (digits.length < 11 || digits.length > 14) {
    throw Object.assign(new Error("Enter a valid EVC/ZAAD mobile number"), { status: 400 });
  }
  return digits;
}

function sanitizeWaafiId(value, fallback) {
  const cleaned = String(value || fallback).replace(/[^a-zA-Z0-9._-]/g, "");
  return (cleaned || fallback).slice(0, 50);
}

export function buildWaafiReferenceId(paymentId) {
  const compact = String(paymentId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  return sanitizeWaafiId(`TD${compact}`, "TDREF");
}

export function buildWaafiAttemptReference(paymentId) {
  const stamp = Date.now().toString(36);
  const compact = String(paymentId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return sanitizeWaafiId(`TD${compact}${stamp}`, `TD${stamp}`);
}

export function isWaafiSuccess(response) {
  const state = String(response?.params?.state || "").toUpperCase();
  if (state && state !== "APPROVED") return false;
  return (
    String(response?.responseCode) === "2001" &&
    String(response?.errorCode) === "0"
  );
}

const WAAFI_ERROR_MESSAGES = {
  RCS_USER_REJECTED:
    "Lacag bixinta waa la diiday taleefankaaga. Fadlan ansixi (Approve) marka EVC/ZAAD kuu soo baxdo, kadib mar kale isku day.",
  RCS_TIMEOUT:
    "Waqtigu wuu dhammaaday. Hubi taleefankaaga oo mar kale isku day.",
  RCS_ACC_INSUFFICIENT_BALANCE:
    "Lacag kugu filan ma jirto wallet-kaaga. Ku shubo EVC/ZAAD kadib isku day.",
  RCS_INSUFFICIENT_BALANCE:
    "Lacag kugu filan ma jirto wallet-kaaga. Ku shubo EVC/ZAAD kadib isku day.",
  RCS_INVALID_ACCOUNT:
    "Lambarka mobile-ka ma saxna. Isticmaal lambarka EVC Plus ama ZAAD (252...).",
  RCS_DUPLICATE_REFERENCE:
    "Isku day mar kale — reference-ka hore waa la isticmaalay.",
  RCS_INVALID_HPPKEY:
    "Waafi merchant credentials are invalid. Check WAAFI_MERCHANT_UID, API_USER_ID, and API_KEY.",
};

const WAAFI_ERROR_CODES = {
  5301: WAAFI_ERROR_MESSAGES.RCS_INVALID_HPPKEY,
  50333: WAAFI_ERROR_MESSAGES.RCS_ACC_INSUFFICIENT_BALANCE,
  5310: WAAFI_ERROR_MESSAGES.RCS_USER_REJECTED,
};

export function formatWaafiError(response) {
  const msg = String(response?.responseMsg || "");
  const code = String(response?.responseCode || response?.errorCode || "");
  const description = String(response?.params?.description || "");

  if (WAAFI_ERROR_MESSAGES[msg]) return WAAFI_ERROR_MESSAGES[msg];
  if (WAAFI_ERROR_CODES[code]) return WAAFI_ERROR_CODES[code];

  if (/creating order/i.test(description)) {
    return "WaafiPay ma abuuri karin order-ka. Hubi: (1) lambarka EVC/ZAAD sax ah, (2) currency SLSH for Somalia wallets, (3) merchant account active, (4) ansixi prompt-ka taleefanka.";
  }

  if (/rejected|declined|aborted/i.test(description)) {
    return WAAFI_ERROR_MESSAGES.RCS_USER_REJECTED;
  }

  if (/insufficient|filna/i.test(description)) {
    return WAAFI_ERROR_MESSAGES.RCS_ACC_INSUFFICIENT_BALANCE;
  }

  if (description) return description;
  if (msg) return `WaafiPay: ${msg}`;
  return "WaafiPay payment was not approved. Check your phone and try again.";
}

function mockWaafiResponse(referenceId) {
  return {
    schemaVersion: "1.0",
    responseCode: "2001",
    errorCode: "0",
    responseMsg: "RCS_SUCCESS",
    params: {
      state: "APPROVED",
      referenceId,
      transactionId: `MOCK-${Date.now()}`,
      txAmount: "0"
    }
  };
}

export async function waafiPurchase({ accountNo, referenceId, invoiceId, amount, description }) {
  const config = getConfig();
  const safeReferenceId = sanitizeWaafiId(referenceId, buildWaafiAttemptReference("pay"));
  const safeInvoiceId = sanitizeWaafiId(invoiceId, safeReferenceId);
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw Object.assign(new Error("Payment amount must be greater than zero"), { status: 400 });
  }

  const body = {
    schemaVersion: "1.0",
    requestId: crypto.randomUUID(),
    timestamp: waafiTimestamp(),
    channelName: "WEB",
    serviceName: "API_PURCHASE",
    serviceParams: {
      merchantUid: config.merchantUid,
      apiUserId: config.apiUserId,
      apiKey: config.apiKey,
      paymentMethod: "mwallet_account",
      payerInfo: {
        accountNo: normalizeWaafiAccountNo(accountNo)
      },
      transactionInfo: {
        referenceId: safeReferenceId,
        invoiceId: safeInvoiceId,
        amount: numericAmount.toFixed(2),
        currency: config.currency,
        description: (description || "GaariHel payment").slice(0, 255)
      }
    }
  };

  if (process.env.WAAFI_DEV_MOCK === "true") {
    return { request: body, response: mockWaafiResponse(safeReferenceId), currency: config.currency };
  }

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(formatWaafiError(data) || `WaafiPay HTTP ${response.status}`);
    error.status = 502;
    error.details = data;
    throw error;
  }

  return { request: body, response: data, currency: config.currency };
}

export function getWaafiPublicConfig() {
  try {
    const config = getConfig();
    return {
      enabled: true,
      currency: config.currency,
      provider: "waafipay",
      devMock: process.env.WAAFI_DEV_MOCK === "true"
    };
  } catch {
    return { enabled: false, currency: "SLSH", provider: "waafipay", devMock: false };
  }
}
