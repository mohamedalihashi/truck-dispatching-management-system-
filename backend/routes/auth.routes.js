import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAuth, signToken, requirePasswordChanged } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../services/dbService.js";
import { dispatchVerificationEmail, verificationPayload } from "../services/emailService.js";
import { registrationUpload, upload } from "../lib/uploads.js";
import { deleteAssets, uploadBuffer } from "../services/cloudinaryService.js";
import { persistUploadedFile } from "../lib/persistUpload.js";
import { strongPasswordSchema, fullNameSchema, optionalEmailSchema, resolveAccountEmail, isPlaceholderEmail } from "../lib/validation.js";
import { authLimiter, otpLimiter, passwordResetLimiter, registrationLimiter, resendLimiter } from "../middleware/security.js";

const router = Router();
const personName = fullNameSchema;
const username = z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9._-]+$/);
const email = optionalEmailSchema;
const phone = z.string().trim().min(7).max(20).regex(/^\+?[0-9\s-]+$/, "Enter a valid phone number");
const shortText = z.string().trim().min(1).max(100);
const addressText = z.string().trim().min(1).max(255);

/** When false, register/login skip email OTP and complete immediately. */
function isAuthOtpEnabled() {
  return String(process.env.AUTH_OTP_ENABLED || "false").toLowerCase() === "true";
}

function publicUser(user) {
  if (!user) return user;
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export const registerSchema = z.object({
  name: personName,
  username,
  email,
  password: strongPasswordSchema,
  role: z.literal("customer"),
  phone,
  customerProfile: z.object({
    customerType: z.enum(["Individual", "Business"]).optional().default("Business"),
    city: shortText,
    companyName: z.string().trim().max(100).optional(),
    address: addressText,
    companyPhone: phone.optional(),
    companyAddress: z.string().trim().max(255).optional(),
    businessRegistrationNumber: z.string().trim().max(100).optional(),
    // Cloudinary https URLs or local /uploads/... fallback paths
    profilePhotoUrl: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value.startsWith("/uploads/") || /^https?:\/\//i.test(value), {
        message: "Invalid profile photo URL"
      })
      .optional(),
    profilePhotoPublicId: z.string().trim().min(1).optional()
  }).optional()
}).superRefine((data, ctx) => {
  if (!data.customerProfile) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerProfile"], message: "Customer profile is required" });
  }
});

const assetUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.startsWith("/uploads/") || /^https?:\/\//i.test(value), {
    message: "Invalid file URL"
  });

export const driverRegisterSchema = z.object({
  name: personName,
  username,
  email,
  password: strongPasswordSchema,
  role: z.literal("driver"),
  phone,
  serviceType: z.enum(["FTL", "SHARED"]),
  nationalIdNumber: z.string().trim().min(1).max(50).optional(),
  driverLicense: z.string().trim().min(1).max(50),
  driverLicenseUrl: assetUrlSchema,
  driverLicensePublicId: z.string().trim().min(1).optional(),
  driverImageUrl: assetUrlSchema,
  driverImagePublicId: z.string().trim().min(1).optional(),
  truck: z.object({
    truckNumber: z.string().trim().min(1).optional(),
    plateNumber: z.string().trim().min(1).max(30),
    capacity: z.coerce.string().trim().min(1).max(30),
    capacityTons: z.coerce.number().positive().optional(),
    truckType: z.string().trim().min(1).max(100),
    region: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    photoUrl1: assetUrlSchema,
    photoUrl2: assetUrlSchema.optional(),
    photoPublicId1: z.string().trim().min(1).optional(),
    photoPublicId2: z.string().trim().min(1).optional(),
    registrationDocumentUrl: assetUrlSchema,
    registrationDocumentPublicId: z.string().trim().min(1).optional(),
    documentUrls: z.array(assetUrlSchema).min(1)
  })
});

function generateTruckNumber() {
  return `TR-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeCapacity(raw) {
  const text = String(raw || "").trim();
  const tons = Number(String(text).replace(/[^\d.]/g, ""));
  if (Number.isFinite(tons) && tons > 0) {
    return {
      capacity: text.toLowerCase().includes("ton") ? text : `${tons} tons`,
      capacityTons: tons
    };
  }
  return { capacity: text, capacityTons: undefined };
}

function validationFailed(res, parsed) {
  return res.status(400).json({
    message: "Validation failed",
    details: {
      ...parsed.error.flatten(),
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    }
  });
}

async function persistRegistrationAsset(file, folder, uploadedPublicIds) {
  if (!file) return { url: null, publicId: null };
  if (file.buffer) {
    const uploaded = await uploadBuffer(file, folder);
    if (uploaded?.publicId) uploadedPublicIds.push(uploaded.publicId);
    return { url: uploaded?.url || null, publicId: uploaded?.publicId || null };
  }
  const url = await persistUploadedFile(file, folder);
  return { url, publicId: null };
}

const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1)
});

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6)
});

function isDbBusyError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "P2024" ||
    message.includes("connection pool") ||
    message.includes("Timed out fetching a new connection") ||
    message.includes("closed the connection") ||
    message.includes("Connection terminated") ||
    message.includes("Unable to start a transaction")
  );
}

function dbBusyResponse(res) {
  return res.status(503).json({ message: "Database is busy. Please wait a moment and try again." });
}

function verificationResponse(email, emailResult) {
  return verificationPayload(email, emailResult);
}

router.post("/register", registrationLimiter, registrationUpload.fields([
  { name: "profilePhoto", maxCount: 1 },
  { name: "driverImage", maxCount: 1 },
  { name: "driverLicenseDocument", maxCount: 1 },
  { name: "truckPhoto1", maxCount: 1 },
  { name: "truckPhoto2", maxCount: 1 },
  { name: "truckDocuments", maxCount: 5 }
]), async (req, res, next) => {
  const uploadedPublicIds = [];
  try {
    const role = String(req.body.role || "customer").toLowerCase();
    if (role !== "customer") {
      return res.status(403).json({
        message: "Only customer accounts can register online. Driver accounts are created by an admin."
      });
    }

    const conflict = await db.findRegistrationConflict({
      username: req.body.username,
      email: String(req.body.email || "").trim() || undefined,
      phone: req.body.phone
    });
    if (conflict) return res.status(409).json({ message: `${conflict} already registered` });

    const profilePhoto = await uploadBuffer(req.files?.profilePhoto?.[0], "customers");
    if (profilePhoto?.publicId) uploadedPublicIds.push(profilePhoto.publicId);
    const payload = {
      name: req.body.name,
      username: req.body.username,
      email: String(req.body.email || "").trim() || undefined,
      phone: req.body.phone,
      password: req.body.password,
      role: "customer",
      customerProfile: {
        customerType: "Business",
        city: req.body.city,
        address: req.body.address,
        profilePhotoUrl: profilePhoto?.url || undefined,
        profilePhotoPublicId: profilePhoto?.publicId || undefined
      }
    };

    const parsed = registerSchema.safeParse(payload);
    if (!parsed.success) {
      await deleteAssets(uploadedPublicIds);
      return validationFailed(res, parsed);
    }
    const accountEmail = resolveAccountEmail({
      email: parsed.data.email,
      username: parsed.data.username,
      phone: parsed.data.phone
    });
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const userPayload = { ...parsed.data, email: accountEmail, password: undefined, passwordHash };

    // No real email → skip OTP (cannot deliver a code)
    if (!isAuthOtpEnabled() || isPlaceholderEmail(accountEmail) || !parsed.data.email) {
      const user = await db.createUser(userPayload);
      const safe = publicUser(user);
      return res.status(201).json({ user: safe, token: signToken(safe) });
    }

    const pendingPayload = userPayload;
    const { code } = await db.createVerificationCode({ email: accountEmail, purpose: "register", payload: pendingPayload });
    const emailResult = await dispatchVerificationEmail(accountEmail, code, "register");
    return res.status(202).json(verificationResponse(accountEmail, emailResult));
  } catch (error) {
    await deleteAssets(uploadedPublicIds);
    if (isDbBusyError(error)) return dbBusyResponse(res);
    next(error);
  }
});

router.post("/register/verify", otpLimiter, validate(verifySchema), async (req, res, next) => {
  try {
    const payload = await db.consumeVerificationCode({
      email: req.body.email,
      code: req.body.code,
      purpose: "register"
    });
    if (!payload || payload.__verified) {
      return res.status(400).json({ message: "Invalid or expired verification code" });
    }

    const role = payload.role;
    if (role === "driver") {
      return res.status(403).json({
        message: "Driver self-registration is not allowed. Contact an admin to register your driver account."
      });
    }

    const parsed = registerSchema.safeParse({ ...payload, password: "Pending1!aA" });
    if (!parsed.success) return res.status(400).json({ message: "Registration data expired. Please register again." });

    const existing = await db.findUserByEmail(parsed.data.email);
    if (existing) return res.status(409).json({ message: "Email already registered" });

    const user = await db.createUser({ ...parsed.data, password: undefined, passwordHash: payload.passwordHash });
    const safe = publicUser(user);
    res.status(201).json({ user: safe, token: signToken(safe) });
  } catch (error) {
    next(error);
  }
});

router.post("/login", authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const user = await db.findUserByIdentifier(req.body.identifier);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: "Invalid username/email or password" });
    }
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return res.status(423).json({ message: "Account temporarily locked. Try again later." });
    }
    if (user.role === "dispatcher") {
      return res.status(403).json({ message: "Dispatcher accounts are no longer supported. Contact an admin." });
    }
    if (user.status === "Inactive") {
      return res.status(403).json({ message: "Account is inactive. Contact an admin." });
    }
    if (user.status !== "Active") {
      const awaitingDocs =
        user.role === "driver" && String(user.status).toLowerCase().includes("pending");
      return res.status(403).json({
        message: awaitingDocs
          ? "Your driver account is awaiting document verification. An admin will activate you soon."
          : "Account is not active or is awaiting verification"
      });
    }
    const valid = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!valid) {
      await db.recordFailedLogin(user.id);
      return res.status(401).json({ message: "Invalid username/email or password" });
    }

    await Promise.all([
      db.clearFailedLogins(user.id),
      db.recordAudit({
        userId: user.id,
        action: "auth.login",
        entityType: "users",
        entityId: user.id,
        description: "User logged in",
      }),
    ]);

    const safe = publicUser(user);
    res.json({ user: safe, token: signToken(safe) });
  } catch (error) {
    if (isDbBusyError(error)) return dbBusyResponse(res);
    next(error);
  }
});

router.post("/login/verify", otpLimiter, validate(verifySchema), async (req, res, next) => {
  try {
    const verified = await db.consumeVerificationCode({
      email: req.body.email,
      code: req.body.code,
      purpose: "login"
    });
    if (!verified) return res.status(400).json({ message: "Invalid or expired verification code" });

    const user = await db.findUserByEmail(req.body.email);
    if (!user) return res.status(404).json({ message: "User not found" });
    const safe = publicUser(user);
    res.json({ user: safe, token: signToken(safe) });
  } catch (error) {
    next(error);
  }
});

router.post("/resend-code", resendLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email().transform((v) => v.trim().toLowerCase()),
      purpose: z.enum(["login", "register", "reset"]),
      password: z.string().optional(),
      registration: registerSchema.optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation failed" });

    const { email, purpose, password, registration } = parsed.data;
    let payload = null;

    if (purpose === "login") {
      if (!password) return res.status(400).json({ message: "Password is required to resend login code" });
      const user = await db.findUserByEmail(email);
      if (!user?.passwordHash) return res.status(401).json({ message: "Invalid email or password" });
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });
    } else if (purpose === "register") {
      payload = await db.getPendingVerificationPayload(email, "register");
      if (!payload && registration) {
        const registrationParsed = registerSchema.safeParse(registration);
        if (registrationParsed.success) payload = registrationParsed.data;
      }
      if (!payload) payload = await db.getLatestRegisterPayload(email);
      if (!payload) {
        return res.status(400).json({ message: "No pending registration found. Please fill the form again." });
      }
      if (payload.role === "driver") {
        return res.status(403).json({
          message: "Driver self-registration is not allowed. Contact an admin to register your driver account."
        });
      }
      const existing = await db.findUserByEmail(email);
      if (existing) return res.status(409).json({ message: "Email already registered" });
    } else {
      const user = await db.findUserByEmail(email);
      if (!user) {
        return res.json({
          message: `If an account exists for ${email}, a reset code was sent.`,
        });
      }
    }

    const { code } = await db.createVerificationCode({ email, purpose, payload });
    const emailResult = await dispatchVerificationEmail(email, code, purpose);
    res.json(verificationResponse(email, emailResult));
  } catch (error) {
    if (
      String(error?.message || "").includes("connection pool") ||
      String(error?.message || "").includes("Timed out fetching a new connection") ||
      error?.code === "P2024"
    ) {
      return res.status(503).json({ message: "Database is busy. Please wait a moment and try again." });
    }
    next(error);
  }
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: strongPasswordSchema
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation failed" });

    const row = await db.findUserByEmail(req.user.email);
    if (!row?.passwordHash) return res.status(404).json({ message: "User not found" });

    const valid = await bcrypt.compare(parsed.data.currentPassword, row.passwordHash);
    if (!valid) return res.status(401).json({ message: "Current password is incorrect" });

    const user = await db.updateUser(req.user.sub, { password: parsed.data.newPassword });
    res.json({ user, token: signToken(user), message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
});

router.patch("/me", requireAuth, requirePasswordChanged, async (req, res, next) => {
  try {
    const { name, phone: phoneValue, password } = req.body;
    const payload = {};
    if (name !== undefined) {
      const parsedName = personName.safeParse(name);
      if (!parsedName.success) {
        return res.status(400).json({ message: parsedName.error.issues[0]?.message || "Invalid full name" });
      }
      payload.name = parsedName.data;
    }
    if (phoneValue !== undefined) {
      const trimmedPhone = String(phoneValue || "").trim();
      if (!trimmedPhone) {
        payload.phone = null;
      } else {
        const parsedPhone = phone.safeParse(trimmedPhone);
        if (!parsedPhone.success) {
          return res.status(400).json({ message: parsedPhone.error.issues[0]?.message || "Invalid phone number" });
        }
        payload.phone = parsedPhone.data;
      }
    }
    if (password) payload.password = password;
    const user = await db.updateUser(req.user.sub, payload);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.post("/me/avatar", requireAuth, requirePasswordChanged, upload.single("avatar"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Profile photo is required" });
    }
    const avatarUrl = await persistUploadedFile(req.file, "avatars");
    if (!avatarUrl) {
      return res.status(400).json({ message: "Could not store profile photo" });
    }
    const user = await db.updateUser(req.user.sub, { avatarUrl });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user, message: "Profile photo updated." });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await db.findSessionUserById(req.user.sub);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.get("/permissions", requireAuth, async (req, res, next) => {
  try {
    const permissions = await db.getPermissionsForUser(req.user.sub);
    if (!permissions) return res.status(404).json({ message: "User not found" });
    res.json(permissions);
  } catch (error) {
    next(error);
  }
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await db.recordAudit({
      userId: req.user.sub,
      action: "auth.logout",
      entityType: "users",
      entityId: req.user.sub,
      description: "User logged out",
    });
    res.json({ message: "Logged out" });
  } catch (error) {
    next(error);
  }
});

router.post("/forgot-password", passwordResetLimiter, async (req, res, next) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Valid email is required" });

    const email = parsed.data.email.trim().toLowerCase();
    void (async () => {
      try {
        const { code } = await db.createVerificationCode({ email, purpose: "reset" });
        await dispatchVerificationEmail(email, code, "reset");
      } catch (error) {
        console.error(`[RESET] Could not prepare reset code for ${email}:`, error.message);
      }
    })();

    res.json({
      message: `If an account exists for ${email}, a reset code will arrive by email shortly.`
    });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-password", passwordResetLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: strongPasswordSchema,
      code: z.string().length(6)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation failed" });

    const verified = await db.consumeVerificationCode({
      email: parsed.data.email,
      code: parsed.data.code,
      purpose: "reset"
    });
    if (!verified) return res.status(400).json({ message: "Invalid or expired verification code" });

    const user = await db.findUserByEmail(parsed.data.email);
    if (!user) return res.status(404).json({ message: "User not found" });
    await db.updateUser(user.id, { password: parsed.data.password });
    res.json({ message: "Password reset successfully" });
  } catch (error) {
    next(error);
  }
});

export default router;
