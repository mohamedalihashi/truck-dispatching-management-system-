import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, requirePasswordChanged, requirePermission } from "../middleware/auth.js";
import { db } from "../services/dbService.js";
import { generateTempPassword } from "../lib/password.js";
import { sendWelcomeEmail } from "../services/emailService.js";
import { documentUpload } from "../lib/uploads.js";
import { persistUploadedFile } from "../lib/persistUpload.js";
import { strongPasswordSchema } from "../lib/validation.js";

const router = Router();
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const createSchema = z.object({
  name: z.string().min(2),
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().email(),
  password: strongPasswordSchema.optional(),
  role: z.enum(["admin", "customer", "driver"]),
  phone: z.string().optional(),
  nationalIdNumber: z.string().trim().min(1).optional(),
  driverLicense: z.string().trim().min(1).optional(),
  driverLicenseUrl: z.string().min(1).optional(),
  driverImageUrl: z.string().min(1).optional(),
  serviceType: z.enum(["FTL", "SHARED"]).optional(),
  dispatcherProfile: z.object({
    dispatcherCode: z.string().trim().min(1),
    nationalIdNumber: z.string().trim().min(1),
    nationalIdFrontUrl: z.string().min(1).optional(),
    nationalIdBackUrl: z.string().min(1),
    profilePhotoUrl: z.string().min(1),
    dateOfBirth: z.coerce.date(),
    gender: z.enum(["Male", "Female", "Other"]),
    city: z.string().trim().min(1),
    address: z.string().trim().min(1),
    cvUrl: z.string().min(1),
    yearsOfExperience: z.coerce.number().int().min(0),
    assignedRegion: z.string().trim().min(1).optional().default("N/A"),
    workShift: z.string().trim().min(1).optional().default("N/A"),
    emergencyContactName: z.string().trim().min(1),
    emergencyContactPhone: z.string().trim().min(1),
    commissionPercentage: z.coerce.number().min(0).max(100).optional().default(0),
    verificationStatus: z.enum(["Pending", "Verified", "Rejected"]).optional().default("Pending"),
    accountStatus: z.enum(["Active", "Inactive", "Suspended"]).optional().default("Active")
  }).optional(),
  customerProfile: z.object({
    customerType: z.enum(["Individual", "Business"]).optional().default("Business"),
    city: z.string().trim().min(1),
    companyName: z.string().trim().optional(),
    address: z.string().trim().min(1),
    companyPhone: z.string().trim().optional(),
    companyAddress: z.string().trim().optional(),
    businessRegistrationNumber: z.string().trim().optional(),
    profilePhotoUrl: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value.startsWith("/uploads/") || /^https?:\/\//i.test(value), {
        message: "Invalid profile photo URL"
      })
      .optional(),
    profilePhotoPublicId: z.string().trim().min(1).optional()
  }).optional(),
  truck: z
    .object({
      truckNumber: z.string().min(1),
      plateNumber: z.string().min(1),
      capacity: z.string().min(1),
      truckType: z.string().trim().min(1),
      region: z.string().trim().min(1),
      city: z.string().trim().min(1),
      photoUrl1: z.string().min(1),
      photoUrl2: z.string().min(1).optional(),
      documentUrls: z.array(z.string().min(1)).min(1)
    })
    .optional()
}).superRefine((data, ctx) => {
  if (data.role === "driver" && !data.serviceType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceType"], message: "Driver service type (FTL or SHARED) is required" });
  }
  if (data.role === "driver" && data.truck && (!data.truck.region?.trim() || !data.truck.city?.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["truck", "city"], message: "Region and city are required for driver registration" });
  }
  if (data.role !== "customer") return;
  if (!data.phone?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Phone is required for customers" });
  }
  if (!data.customerProfile) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerProfile"], message: "Customer profile is required" });
  }
});

router.use(requireAuth);
router.use(requirePasswordChanged);
router.use(requirePermission("users"));

router.get("/", requireRole("admin"), async (req, res, next) => {
  try {
    res.json(
      await db.listUsers({
        role: req.query.role,
        search: req.query.search,
        page: req.query.page,
        limit: req.query.limit
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get("/summary", requireRole("admin"), async (req, res, next) => {
  try {
    res.json(await db.userSummary());
  } catch (error) {
    next(error);
  }
});

router.post(
  "/",
  requireRole("admin"),
  documentUpload.fields([
    { name: "truckPhoto1", maxCount: 1 },
    { name: "truckPhoto2", maxCount: 1 },
    { name: "driverImage", maxCount: 1 },
    { name: "driverLicenseDocument", maxCount: 1 },
    { name: "truckDocuments", maxCount: 5 },
    { name: "profilePhoto", maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const requestedRole = req.body.role;
      if (requestedRole === "admin") {
        const actor = await db.findUserById(req.user.sub);
        if (!actor?.isSuperAdmin) {
          return res.status(403).json({ message: "Only the Super Admin can create another admin" });
        }
      }
      if (requestedRole === "dispatcher") {
        return res.status(400).json({ message: "Dispatcher accounts are no longer supported" });
      }

      const role = requestedRole;
      const truckPayload =
        role === "driver"
          ? {
              truckNumber: req.body.truckNumber,
              plateNumber: req.body.plateNumber,
              capacity: req.body.capacity,
              truckType: req.body.truckType,
              region: req.body.region,
              city: req.body.city,
              photoUrl1: (await persistUploadedFile(req.files?.truckPhoto1?.[0], "trucks")) || undefined,
              photoUrl2: (await persistUploadedFile(req.files?.truckPhoto2?.[0], "trucks")) || undefined,
              documentUrls: (
                await Promise.all(
                  (req.files?.truckDocuments || []).map((file) => persistUploadedFile(file, "truck-docs"))
                )
              ).filter(Boolean)
            }
          : undefined;

      const customerProfilePhotoUrl =
        role === "customer"
          ? (await persistUploadedFile(req.files?.profilePhoto?.[0], "customers")) || undefined
          : undefined;

      const parsed = createSchema.safeParse({
        name: req.body.name,
        username: req.body.username,
        email: req.body.email,
        password: req.body.password || undefined,
        role,
        phone: req.body.phone || undefined,
        nationalIdNumber: role === "driver" ? req.body.nationalIdNumber || undefined : undefined,
        driverLicense: role === "driver" ? req.body.driverLicense : undefined,
        driverLicenseUrl:
          role === "driver"
            ? (await persistUploadedFile(req.files?.driverLicenseDocument?.[0], "licenses")) || undefined
            : undefined,
        driverImageUrl:
          role === "driver"
            ? (await persistUploadedFile(req.files?.driverImage?.[0], "drivers")) || undefined
            : undefined,
        serviceType: role === "driver" ? req.body.serviceType : undefined,
        customerProfile:
          role === "customer"
            ? {
                customerType: "Business",
                city: req.body.city,
                address: req.body.address,
                profilePhotoUrl: customerProfilePhotoUrl
              }
            : undefined,
        truck: truckPayload
      });

      if (!parsed.success) {
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

      if (parsed.data.role === "driver" && !parsed.data.truck) {
        return res.status(400).json({ message: "Driver accounts require a truck" });
      }

      if (parsed.data.role === "driver" && !req.files?.truckPhoto1?.[0]) {
        return res.status(400).json({ message: "One truck photo is required for driver registration" });
      }

      if (parsed.data.role === "driver" && (!parsed.data.driverLicense || !parsed.data.driverLicenseUrl || !parsed.data.driverImageUrl || !parsed.data.truck.documentUrls.length)) {
        return res.status(400).json({ message: "Driver license number/document, driver photo, and at least one truck document are required" });
      }

      const existing = await db.findUserByEmail(parsed.data.email);
      if (existing) return res.status(409).json({ message: "Email already registered" });

      const tempPassword = parsed.data.password || generateTempPassword();
      const truck = parsed.data.truck
        ? {
            ...parsed.data.truck,
            registrationDocumentUrl: parsed.data.truck.documentUrls[0],
            documentUrls: parsed.data.truck.documentUrls
          }
        : undefined;
      const user = await db.createUser({
        name: parsed.data.name,
        username: parsed.data.username,
        email: parsed.data.email,
        password: tempPassword,
        role: parsed.data.role,
        phone: parsed.data.phone,
        nationalIdNumber: parsed.data.nationalIdNumber,
        driverLicense: parsed.data.driverLicense,
        driverLicenseUrl: parsed.data.driverLicenseUrl,
        driverImageUrl: parsed.data.driverImageUrl,
        serviceType: parsed.data.serviceType,
        customerProfile: parsed.data.customerProfile,
        truck,
        mustChangePassword: true,
        actorId: req.user.sub,
        // Admin already reviewed docs while creating the account
        autoVerify: parsed.data.role === "driver"
      });

      const emailResult = await sendWelcomeEmail(parsed.data.email, tempPassword);

      res.status(201).json({
        user,
        message: `Account created. Temporary password sent to ${parsed.data.email}.`,
        devPassword: emailResult.devPassword
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post("/:id/verify-driver", requireRole("admin"), async (req, res, next) => {
  try {
    const user = await db.verifyDriver(req.params.id, req.user.sub);
    if (!user) return res.status(404).json({ message: "Driver not found" });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const [actor, target] = await Promise.all([
      db.findUserById(req.user.sub),
      db.findUserById(req.params.id)
    ]);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.isSuperAdmin && !actor?.isSuperAdmin) {
      return res.status(403).json({ message: "Only the Super Admin can update the Super Admin account" });
    }
    if (req.body.role === "admin" && target.role !== "admin" && !actor?.isSuperAdmin) {
      return res.status(403).json({ message: "Only the Super Admin can promote users to admin" });
    }
    const user = await db.updateUser(req.params.id, req.body, { actorId: req.user.sub, action: "user.updated" });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const ok = await db.deleteUser(req.params.id);
    if (!ok) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted" });
  } catch (error) {
    next(error);
  }
});

export default router;
