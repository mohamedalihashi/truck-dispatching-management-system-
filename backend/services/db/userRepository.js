import bcrypt from "bcryptjs";
import { prisma, withTransaction } from "../../lib/prisma.js";
import { auditFields } from "../../lib/auditContext.js";
import { mapUser, userInclude } from "./mappers.js";

export const userRepository = {
async findUserByEmail(email) {
  const row = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: userInclude,
  });
  if (!row) return null;
  return {
    ...mapUser(row),
    passwordHash: row.passwordHash,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
  };
},

async findUserByIdentifier(identifier) {
  const value = identifier.trim();
  const row = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: value, mode: "insensitive" } },
        { email: { equals: value, mode: "insensitive" } },
      ],
    },
    include: userInclude,
  });
  if (!row) return null;
  return {
    ...mapUser(row),
    passwordHash: row.passwordHash,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
  };
},

async findRegistrationConflict({ username, email, phone, plateNumber, nationalIdNumber }) {
  const [user, truck] = await Promise.all([
    prisma.user.findFirst({
      where: { OR: [
        ...(email ? [{ email: { equals: email, mode: "insensitive" } }] : []),
        ...(username ? [{ username: { equals: username, mode: "insensitive" } }] : []),
        ...(phone ? [{ phone }] : []),
        ...(nationalIdNumber ? [{ nationalIdNumber }] : []),
      ] },
      select: { username: true, email: true, phone: true, nationalIdNumber: true },
    }),
    plateNumber ? prisma.truck.findUnique({ where: { plateNumber }, select: { id: true } }) : null,
  ]);
  if (truck) return "Plate number";
  if (!user) return null;
  if (username && user.username?.toLowerCase() === username.toLowerCase()) return "Username";
  if (email && user.email.toLowerCase() === email.toLowerCase()) return "Email";
  if (phone && user.phone === phone) return "Phone";
  return "National ID number";
},

async recordFailedLogin(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: { failedLoginAttempts: true } });
  if (!user) return;
  const failedLoginAttempts = user.failedLoginAttempts + 1;
  await prisma.user.update({
    where: { id },
    data: {
      failedLoginAttempts,
      lockedUntil: failedLoginAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
    },
  });
},

async clearFailedLogins(id) {
  await prisma.user.update({
    where: { id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
},

async findUserById(id) {
  const row = await prisma.user.findUnique({
    where: { id },
    include: userInclude,
  });
  return mapUser(row);
},

async listUsers({ role, search, page = 1, limit = 50, scopedToDispatcherId } = {}) {
  const where = {};
  if (role) where.role = role;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      ...(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(search) ? [{ id: search }] : []),
    ];
  }

  if (scopedToDispatcherId && role === "customer") {
    const visibleIds = await this.listDispatcherCustomerIds(scopedToDispatcherId);
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { createdById: scopedToDispatcherId },
          ...(visibleIds.length ? [{ id: { in: visibleIds } }] : [])
        ]
      }
    ];
  }

  const offset = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: offset,
    }),
    prisma.user.count({ where }),
  ]);
  return { data: data.map(mapUser), total, page: Number(page) };
},

async listDispatcherCustomerIds(dispatcherId) {
  const [fromCargo, fromTrips, fromAudit] = await Promise.all([
    prisma.cargoRequest.findMany({
      where: { dispatcherId },
      select: { customerId: true },
      distinct: ["customerId"],
    }),
    prisma.trip.findMany({
      where: { dispatcherId },
      select: { customerId: true },
      distinct: ["customerId"],
    }),
    prisma.auditLog.findMany({
      where: {
        userId: dispatcherId,
        action: "user.created",
        entityType: "users",
      },
      select: { entityId: true },
    }),
  ]);

  return [
    ...new Set([
      ...fromCargo.map((row) => row.customerId),
      ...fromTrips.map((row) => row.customerId),
      ...fromAudit.map((row) => row.entityId).filter(Boolean),
    ]),
  ];
},

async isCustomerVisibleToDispatcher(customerId, dispatcherId) {
  if (!customerId || !dispatcherId) return false;
  const customer = await prisma.user.findFirst({
    where: {
      id: customerId,
      role: "customer",
      OR: [
        { createdById: dispatcherId },
        { cargoRequestsAsCustomer: { some: { dispatcherId } } },
        { tripsAsCustomer: { some: { dispatcherId } } },
      ],
    },
    select: { id: true },
  });
  if (customer) return true;

  const fromAudit = await prisma.auditLog.findFirst({
    where: {
      userId: dispatcherId,
      action: "user.created",
      entityType: "users",
      entityId: customerId,
    },
    select: { id: true },
  });
  return Boolean(fromAudit);
},

async userSummary({ scopedToDispatcherId } = {}) {
  if (!scopedToDispatcherId) {
    const [total, active, inactive, customers, dispatchers, drivers, driverActive, trucks] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "Active" } }),
      prisma.user.count({ where: { status: "Inactive" } }),
      prisma.user.count({ where: { role: "customer" } }),
      prisma.user.count({ where: { role: "dispatcher" } }),
      prisma.user.count({ where: { role: "driver" } }),
      prisma.user.count({ where: { role: "driver", status: "Active" } }),
      prisma.truck.count(),
    ]);

    return { total, active, inactive, customers, dispatchers, drivers, driverActive, trucks };
  }

  const visibleIds = await this.listDispatcherCustomerIds(scopedToDispatcherId);
  const customerWhere = {
    role: "customer",
    OR: [
      { createdById: scopedToDispatcherId },
      ...(visibleIds.length ? [{ id: { in: visibleIds } }] : []),
    ],
  };
  const [customers, active, inactive, drivers, driverActive, trucks] = await Promise.all([
    prisma.user.count({ where: customerWhere }),
    prisma.user.count({ where: { ...customerWhere, status: "Active" } }),
    prisma.user.count({ where: { ...customerWhere, status: "Inactive" } }),
    prisma.user.count({ where: { role: "driver" } }),
    prisma.user.count({ where: { role: "driver", status: "Active" } }),
    prisma.truck.count(),
  ]);

  return {
    total: customers,
    active,
    inactive,
    customers,
    dispatchers: 0,
    drivers,
    driverActive,
    trucks,
  };
},

async createUser({ name, username, email, password, passwordHash: suppliedPasswordHash, role, phone, customerProfile, nationalIdNumber, driverLicense, driverLicenseUrl, driverLicensePublicId, driverImageUrl, driverImagePublicId, dispatcherProfile, truck, mustChangePassword = false, actorId = null }) {
  const passwordHash = suppliedPasswordHash || await bcrypt.hash(password, 10);
  return withTransaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        username: username?.trim().toLowerCase() || null,
        email,
        passwordHash,
        role,
        phone: phone || null,
        avatarUrl: role === "customer" ? customerProfile?.profilePhotoUrl || null : null,
        avatarPublicId: role === "customer" ? customerProfile?.profilePhotoPublicId || null : null,
        nationalIdNumber: role === "driver" ? nationalIdNumber : null,
        driverLicense: role === "driver" ? driverLicense : null,
        driverLicenseUrl: role === "driver" ? driverLicenseUrl : null,
        driverLicensePublicId: role === "driver" ? driverLicensePublicId : null,
        driverImageUrl: role === "driver" ? driverImageUrl : null,
        driverImagePublicId: role === "driver" ? driverImagePublicId : null,
        status: role === "driver" ? "Pending Verification" : "Active",
        mustChangePassword: Boolean(mustChangePassword),
        createdById: actorId || null,
      },
    });

    if (role === "driver") {
      if (!truck?.truckNumber || !truck?.plateNumber || !truck?.capacity || !truck?.truckType) {
        const error = new Error("Driver registration requires truck details");
        error.status = 400;
        throw error;
      }
      if (!truck?.photoUrl1) {
        const error = new Error("Driver registration requires one truck photo");
        error.status = 400;
        throw error;
      }
      const documentUrls = Array.isArray(truck.documentUrls)
        ? truck.documentUrls.filter(Boolean)
        : [];
      const registrationDocumentUrl = truck.registrationDocumentUrl || documentUrls[0];
      if (!driverLicense || !driverLicenseUrl || !driverImageUrl || !registrationDocumentUrl) {
        const error = new Error("Driver registration requires licence, profile photo, and truck documents");
        error.status = 400;
        throw error;
      }
      await tx.truck.create({
        data: {
          truckNumber: truck.truckNumber,
          plateNumber: truck.plateNumber,
          capacity: truck.capacity,
          truckType: truck.truckType,
          region: truck.region || "",
          city: truck.city || "",
          photoUrl1: truck.photoUrl1,
          photoUrl2: truck.photoUrl2 || null,
          photoPublicId1: truck.photoPublicId1 || null,
          photoPublicId2: truck.photoPublicId2 || null,
          registrationDocumentUrl,
          registrationDocumentPublicId: truck.registrationDocumentPublicId || null,
          documentUrls: documentUrls.length ? documentUrls : [registrationDocumentUrl],
          driverId: user.id,
          status: "Pending_Verification",
        },
      });
    }

    if (role === "dispatcher") {
      if (!dispatcherProfile) {
        const error = new Error("Dispatcher registration requires a complete dispatcher profile");
        error.status = 400;
        throw error;
      }
      await tx.dispatcherProfile.create({
        data: {
          ...dispatcherProfile,
          userId: user.id,
          verifiedBy: dispatcherProfile.verificationStatus === "Verified" ? actorId : null,
          verifiedAt: dispatcherProfile.verificationStatus === "Verified" ? new Date() : null,
        },
      });
    }

    if (role === "customer" && customerProfile) {
      await tx.customerProfile.create({ data: { ...customerProfile, userId: user.id } });
    }

    await tx.auditLog.create({
      data: {
        userId: actorId || user.id,
        action: "user.created",
        entityType: "users",
        entityId: user.id,
        meta: { role, mustChangePassword: Boolean(mustChangePassword) },
      },
    });

    const created = await tx.user.findUnique({ where: { id: user.id }, include: userInclude });
    return mapUser(created);
  });
},

async updateUser(id, payload, { actorId = id, action = "profile.updated" } = {}) {
  const previous = await prisma.user.findUnique({
    where: { id },
    select: { name: true, email: true, phone: true, avatarUrl: true, status: true, role: true, mustChangePassword: true },
  });
  const data = {};
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.email !== undefined) data.email = payload.email;
  if (payload.phone !== undefined) data.phone = payload.phone;
  if (payload.avatarUrl !== undefined) data.avatarUrl = payload.avatarUrl;
  if (payload.status !== undefined) data.status = payload.status;
  if (payload.role !== undefined) data.role = payload.role;
  if (payload.password) {
    data.passwordHash = await bcrypt.hash(payload.password, 10);
    data.mustChangePassword = false;
  }

  if (Object.keys(data).length > 0) {
    await prisma.user.update({ where: { id }, data });
    const safeChanges = Object.fromEntries(Object.entries(data).filter(([key]) => key !== "passwordHash"));
    await prisma.auditLog.create({
      data: auditFields({
        userId: actorId,
        action: payload.password ? "password.changed" : action,
        entityType: "users",
        entityId: id,
        description: payload.password ? "User password changed" : "User profile or account updated",
        oldValues: previous,
        newValues: safeChanges,
      }),
    });
  }
  return this.findUserById(id);
},

async verifyDriver(id, actorId) {
  return withTransaction(async (tx) => {
    const driver = await tx.user.findFirst({ where: { id, role: "driver" } });
    if (!driver) return null;
    await tx.user.update({ where: { id }, data: { status: "Active" } });
    await tx.truck.updateMany({ where: { driverId: id }, data: { status: "Available" } });
    await tx.auditLog.create({
      data: auditFields({ userId: actorId, action: "driver.verified", entityType: "users", entityId: id, description: "Driver account verified", oldValues: { status: driver.status }, newValues: { status: "Active" }, meta: {} }),
    });
    const updated = await tx.user.findUnique({ where: { id }, include: userInclude });
    return mapUser(updated);
  });
},

async deleteUser(id) {
  return withTransaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id },
      select: { role: true },
    });
    if (!user) return false;
    if (user.role === "admin") {
      const error = new Error("Admin users cannot be deleted");
      error.status = 403;
      throw error;
    }
    await tx.auditLog.updateMany({
      where: { userId: id },
      data: { userId: null },
    });
    const result = await tx.user.deleteMany({ where: { id } });
    return result.count > 0;
  });
},


};
