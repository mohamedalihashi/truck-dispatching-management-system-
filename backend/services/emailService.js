const smtpConfigured = Boolean(
  process.env.SMTP_USER && process.env.SMTP_PASS
);

let transporter = null;

function smtpHost() {
  return process.env.SMTP_HOST || "smtp.gmail.com";
}

function smtpPort() {
  return Number(process.env.SMTP_PORT || 587);
}

function smtpPass() {
  return String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
}

function isLocalDemoEmail(email) {
  return /@truckdispatch\.local$/i.test(email);
}

async function getTransporter() {
  if (!smtpConfigured) return null;
  if (!transporter) {
    const nodemailer = await import("nodemailer");
    transporter = nodemailer.default.createTransport({
      host: smtpHost(),
      port: smtpPort(),
      secure: process.env.SMTP_SECURE === "true",
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000,
      auth: {
        user: process.env.SMTP_USER,
        pass: smtpPass()
      }
    });
  }
  return transporter;
}

export function isEmailDevMode() {
  return process.env.NODE_ENV !== "production" && process.env.EMAIL_DEV_MODE === "true";
}

function purposeLabel(purpose) {
  if (purpose === "register") return "complete your registration";
  if (purpose === "reset") return "reset your password";
  return "sign in";
}

function buildMailContent(code, purpose) {
  const appName = "GaariHel";
  const action = purposeLabel(purpose);
  const subject = `${appName} verification code`;
  const text = [
    `Your ${appName} verification code is: ${code}`,
    "",
    `Use this code to ${action}. It expires in 10 minutes.`,
    "",
    "If you did not request this, you can ignore this email."
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#0d1c32;margin:0 0 12px">${appName}</h2>
      <p style="color:#444;line-height:1.5">Use this code to ${action}:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#fe6b00;margin:20px 0">${code}</p>
      <p style="color:#666;font-size:14px">This code expires in 10 minutes.</p>
    </div>
  `;
  return { subject, text, html };
}

/**
 * Send OTP email. Returns { devCode?, userMessage? } when the code must be shown in the UI.
 */
export async function sendVerificationEmail(email, code, purpose) {
  if (isLocalDemoEmail(email) && isEmailDevMode()) {
    console.log(`[EMAIL] Demo address ${email} - OTP: ${code}`);
    return {
      devCode: code,
      userMessage:
        "Demo accounts cannot receive email. Use the verification code shown below."
    };
  }

  if (isEmailDevMode()) {
    console.log(`[EMAIL] DEV MODE - OTP for ${email}: ${code}`);
    return {
      devCode: code,
      userMessage: "Dev mode: use the verification code shown below (also logged in the server console)."
    };
  }

  const mailer = await getTransporter();
  if (!mailer) {
    console.error(`[EMAIL] SMTP is not configured for ${email}`);
    return {
      userMessage: "Verification email could not be sent. Contact support."
    };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { subject, text, html } = buildMailContent(code, purpose);

  try {
    await mailer.sendMail({ from, to: email, subject, text, html });
    console.log(`Verification email sent to ${email}`);
    return {
      userMessage: `Verification code sent to ${email}. Check your inbox and spam folder.`
    };
  } catch (error) {
    console.error(`[EMAIL] Failed to send to ${email}:`, error.message);
    return {
      userMessage: "Verification email could not be sent. Try again later."
    };
  }
}

/** Respond fast; send OTP in the background when SMTP is configured. */
export async function dispatchVerificationEmail(email, code, purpose) {
  if ((isLocalDemoEmail(email) && isEmailDevMode()) || !smtpConfigured || isEmailDevMode()) {
    return sendVerificationEmail(email, code, purpose);
  }

  void sendVerificationEmail(email, code, purpose).catch((error) => {
    console.error(`[EMAIL] Background OTP failed for ${email}:`, error.message);
  });

  return {
    userMessage: `Verification code sent to ${email}. Check your inbox and spam folder.`
  };
}

export function verificationPayload(email, emailResult = {}) {
  const body = {
    verificationRequired: true,
    email,
    message:
      emailResult.userMessage ||
      `Verification code sent to ${email}. Check your inbox and spam folder.`
  };
  if (isEmailDevMode() && emailResult.devCode) body.devCode = emailResult.devCode;
  return body;
}

/** Welcome email when an admin creates a user (driver, customer, etc.). */
export async function sendWelcomeEmail(email, tempPassword, { name, role } = {}) {
  const appName = "GaariHel";
  const loginUrl = (process.env.APP_PUBLIC_URL || "http://localhost:5173").replace(/\/$/, "");
  const roleLabel =
    role === "driver" ? "driver" : role === "customer" ? "customer" : role === "admin" ? "admin" : "user";
  const greeting = name ? `Hi ${name},` : "Hello,";
  const roleLine =
    role === "driver"
      ? "Your driver account is ready. An administrator registered you on GaariHel."
      : "An administrator created your account on GaariHel.";
  const subject = `${appName} — your new ${roleLabel} account`;
  const text = [
    greeting,
    "",
    roleLine,
    "",
    `Sign in: ${loginUrl}/login`,
    `Email: ${email}`,
    `Temporary password: ${tempPassword}`,
    "",
    "Steps:",
    "1. Sign in with your email and the temporary password above.",
    "2. You will be asked to set a new password before using the dashboard."
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#0d1c32;margin:0 0 12px">${appName}</h2>
      <p style="color:#444;line-height:1.6">${greeting}</p>
      <p style="color:#444;line-height:1.6">${roleLine}</p>
      <div style="background:#f5f7fb;border-radius:8px;padding:16px;margin:20px 0">
        <p style="margin:0 0 8px;color:#666;font-size:13px">Sign in</p>
        <p style="margin:0 0 12px"><a href="${loginUrl}/login" style="color:#fe6b00">${loginUrl}/login</a></p>
        <p style="margin:0 0 8px;color:#666;font-size:13px">Email</p>
        <p style="margin:0 0 12px;font-weight:600;color:#0d1c32">${email}</p>
        <p style="margin:0 0 8px;color:#666;font-size:13px">Temporary password</p>
        <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:1px;color:#0d1c32">${tempPassword}</p>
      </div>
      <p style="color:#444;line-height:1.6;font-size:14px">
        After sign-in you <strong>must change your password</strong> before using the system.
      </p>
    </div>
  `;

  if (isEmailDevMode()) {
    console.log(`[EMAIL] Welcome ${email} — password: ${tempPassword}`);
    return {
      sent: false,
      devPassword: tempPassword,
      userMessage: "Dev mode: share the temporary password shown below with the user."
    };
  }

  const mailer = await getTransporter();
  if (!mailer) {
    console.log(`[EMAIL] SMTP not configured — welcome password for ${email}: ${tempPassword}`);
    return {
      sent: false,
      devPassword: tempPassword,
      userMessage: "SMTP is not configured. Share the temporary password below with the driver."
    };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    await mailer.sendMail({ from, to: email, subject, text, html });
    console.log(`Welcome email sent to ${email}`);
    return { sent: true, userMessage: `Login password sent to ${email}.` };
  } catch (error) {
    console.error(`[EMAIL] Welcome failed for ${email}:`, error.message);
    console.log(`[EMAIL] Fallback password for ${email}: ${tempPassword}`);
    return {
      sent: false,
      devPassword: tempPassword,
      userMessage: `Email could not be sent. Share the temporary password below with the driver.`
    };
  }
}
