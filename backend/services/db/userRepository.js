import bcrypt from "bcryptjs";
import { prisma, withTransaction } from "../../lib/prisma.js";
import { auditFields } from "../../lib/auditContext.js";
import { mapUser, userInclude } from "./mappers.js";
import { normalizeSomaliPhone, phoneDigits } from "../../lib/phone.js";
import { generateTempPassword } from "../../lib/password.js";

const authUserSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  phone: true,
  passwordHash: true,
  status: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  mustChangePassword: true,
  isSuperAdmin: true,
  serviceType: true,
};

const sessionUserSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  isSuperAdmin: true,
  phone: true,
  avatarUrl: true,
  avatarPublicId: true,
  nationalIdNumber: true,
  driverLicense: true,
  driverLicenseUrl: true,
  driverLicensePublicId: true,
  driverImageUrl: true,
  driverImagePublicId: true,
  serviceType: true,
  status: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  truck: {
    select: {
      id: true,
      truckNumber: true,
      plateNumber: true,
      truckType: true,
      capacity: true,
      status: true,
      photoUrl1: true,
      photoUrl2: true,
      documentUrls: true,
      registrationDocumentUrl: true,
      region: true,
      city: true,
    },
  },
  dispatcherProfile: true,
  customerProfile: true,
};

const bookingCustomerSelect = {
  id: true,
  role: true,
  name: true,
  phone: true,
};

function mapAuthUser(row) {
  if (!row) return null;
  return {
    ...mapUser(row),
    passwordHash: row.passwordHash,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
  };
}

export const userRepository = {
async findUserByEmail(email) {
  const row = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: authUserSelect,
  });
  return mapAuthUser(row);
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
    select: authUserSelect,
  });
  return mapAuthUser(row);
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

async findSessionUserById(id) {
  const row = await prisma.user.findUnique({
    where: { id },
    select: sessionUserSelect,
  });
  return mapUser(row);
},

async findBookingCustomerById(id) {
  return prisma.user.findUnique({
    where: { id },
    select: bookingCustomerSelect,
  });
},

async listUsers({ role, search, page = 1, limit = 50, scopedToDispatcherId } = {}) {
  const where = { status: { not: "Deleted" } };
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
    const visibleUser = { status: { not: "Deleted" } };
    const [total, active, inactive, customers, dispatchers, drivers, driverActive, trucks] = await Promise.all([
      prisma.user.count({ where: visibleUser }),
      prisma.user.count({ where: { status: "Active" } }),
      prisma.user.count({ where: { status: "Inactive" } }),
      prisma.user.count({ where: { ...visibleUser, role: "customer" } }),
      prisma.user.count({ where: { ...visibleUser, role: "dispatcher" } }),
      prisma.user.count({ where: { ...visibleUser, role: "driver" } }),
      prisma.user.count({ where: { role: "driver", status: "Active" } }),
      prisma.truck.count(),
    ]);

    return { total, active, inactive, customers, dispatchers, drivers, driverActive, trucks };
  }

  const visibleIds = await this.listDispatcherCustomerIds(scopedToDispatcherId);
  const customerWhere = {
    role: "customer",
    status: { not: "Deleted" },
    OR: [
      { createdById: scopedToDispatcherId },
      ...(visibleIds.length ? [{ id: { in: visibleIds } }] : []),
    ],
  };
  const [customers, active, inactive, drivers, driverActive, trucks] = await Promise.all([
    prisma.user.count({ where: customerWhere }),
    prisma.user.count({ where: { ...customerWhere, status: "Active" } }),
    prisma.user.count({ where: { ...customerWhere, status: "Inactive" } }),
    prisma.user.count({ where: { role: "driver", status: { not: "Deleted" } } }),
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

async createUser({ name, username, email, password, passwordHash: suppliedPasswordHash, role, phone, customerProfile, nationalIdNumber, driverLicense, driverLicenseUrl, driverLicensePublicId, driverImageUrl, driverImagePublicId, serviceType, dispatcherProfile, truck, mustChangePassword = false, actorId = null, autoVerify = false }) {
  const passwordHash = suppliedPasswordHash || await bcrypt.hash(password, 10);
  // Admin-created drivers are trusted (docs reviewed at create time). Self-register stays pending.
  const driverActive = role === "driver" && Boolean(autoVerify);
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
        serviceType: role === "driver" ? (serviceType || null) : null,
        status: role === "driver" ? (driverActive ? "Active" : "Pending Verification") : "Active",
        mustChangePassword: Boolean(mustChangePassword),
        createdById: actorId || null,
      },
    });

    if (role === "driver") {
      if (!serviceType || !["FTL", "SHARED"].includes(serviceType)) {
        const error = new Error("Driver registration requires service type (FTL or SHARED)");
        error.status = 400;
        throw error;
      }
      if (!truck?.plateNumber || !truck?.capacity || !truck?.truckType) {
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
      const truckNumber =
        truck.truckNumber?.trim() ||
        `TR-${Date.now().toString(36).toUpperCase()}`;
      await tx.truck.create({
        data: {
          truckNumber,
          plateNumber: truck.plateNumber,
          capacity: truck.capacity,
          capacityTons: truck.capacityTons != null ? truck.capacityTons : null,
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
          status: driverActive ? "Available" : "Pending_Verification",
        },
      });
    }

    if (role === "dispatcher") {
      const error = new Error("Dispatcher accounts are no longer supported");
      error.status = 400;
      throw error;
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

/**
 * Find or create a walk-in customer for dispatcher bookings
 * (person who is not using the app themselves).
 */
async ensureOfflineCustomer({ name, phone, city = "Mogadishu", actorId }) {
  const normalized = normalizeSomaliPhone(phone);
  const digits = phoneDigits(normalized);
  const last9 = digits.slice(-9);

  const existing = await prisma.user.findFirst({
    where: {
      role: "customer",
      OR: [
        { phone: normalized },
        ...(last9.length >= 7 ? [{ phone: { endsWith: last9 } }] : []),
      ],
    },
    include: userInclude,
  });
  if (existing) {
    if (actorId && !existing.createdById) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { createdById: actorId },
      });
      return mapUser(await prisma.user.findUnique({ where: { id: existing.id }, include: userInclude }));
    }
    return mapUser(existing);
  }

  const base = `walkin_${digits}`.slice(0, 24);
  let username = base;
  let email = `${base}@offline.local`;
  let suffix = 0;
  while (await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: username, mode: "insensitive" } },
        { email: { equals: email, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  })) {
    suffix += 1;
    username = `${base}_${suffix}`.slice(0, 30);
    email = `${base}_${suffix}@offline.local`;
  }

  const passwordHash = await bcrypt.hash(generateTempPassword(14), 10);
  const trimmedName = String(name || "").trim();
  if (trimmedName.length < 2) {
    const error = new Error("Customer name is required");
    error.status = 400;
    throw error;
  }

  return withTransaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: trimmedName,
        username,
        email,
        passwordHash,
        role: "customer",
        phone: normalized,
        status: "Active",
        mustChangePassword: true,
        createdById: actorId || null,
      },
    });

    await tx.customerProfile.create({
      data: {
        userId: user.id,
        customerType: "Individual",
        city: String(city || "Mogadishu").trim() || "Mogadishu",
        address: "Booked offline by dispatcher",
        companyName: null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId || user.id,
        action: "user.created",
        entityType: "users",
        entityId: user.id,
        meta: { role: "customer", offline: true, mustChangePassword: true },
      },
    });

    const created = await tx.user.findUnique({ where: { id: user.id }, include: userInclude });
    return mapUser(created);
  });
},

async updateUser(id, payload, { actorId = id, action = "profile.updated" } = {}) {
  const previous = await prisma.user.findUnique({
    where: { id },
    include: { truck: true, customerProfile: true },
  });
  if (!previous) return null;

  const data = {};
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.email !== undefined) data.email = payload.email;
  if (payload.phone !== undefined) data.phone = payload.phone;
  if (payload.avatarUrl !== undefined) data.avatarUrl = payload.avatarUrl;
  if (payload.status !== undefined) data.status = payload.status;
  if (payload.role !== undefined) data.role = payload.role;
  if (payload.driverLicense !== undefined) data.driverLicense = payload.driverLicense;
  if (payload.nationalIdNumber !== undefined) data.nationalIdNumber = payload.nationalIdNumber;
  if (payload.serviceType !== undefined && previous.role === "driver") {
    if (!["FTL", "SHARED"].includes(payload.serviceType)) {
      const error = new Error("Invalid service type");
      error.status = 400;
      throw error;
    }
    if (payload.serviceType !== previous.serviceType) {
      const [activeTrips, activeShared] = await Promise.all([
        prisma.trip.count({
          where: {
            driverId: id,
            status: { notIn: ["Delivered", "Cancelled"] },
          },
        }),
        prisma.sharedTrip.count({
          where: {
            driverId: id,
            status: {
              in: [
                "Open_for_Booking",
                "Partially_Booked",
                "Fully_Booked",
                "Departed",
                "In_Transit",
              ],
            },
          },
        }),
      ]);
      if (activeTrips > 0 || activeShared > 0) {
        const error = new Error("Cannot change service type while an active trip exists");
        error.status = 400;
        throw error;
      }
    }
    data.serviceType = payload.serviceType;
  }
  if (payload.password) {
    data.passwordHash = await bcrypt.hash(payload.password, 10);
    data.mustChangePassword = false;
  }

  const truckPayload = payload.truck && typeof payload.truck === "object" ? payload.truck : null;
  const truckData = {};
  if (truckPayload) {
    if (truckPayload.truckNumber !== undefined) truckData.truckNumber = truckPayload.truckNumber;
    if (truckPayload.plateNumber !== undefined) truckData.plateNumber = truckPayload.plateNumber;
    if (truckPayload.capacity !== undefined) truckData.capacity = truckPayload.capacity;
    if (truckPayload.capacityTons !== undefined) truckData.capacityTons = truckPayload.capacityTons;
    if (truckPayload.truckType !== undefined) truckData.truckType = truckPayload.truckType;
    if (truckPayload.type !== undefined) truckData.truckType = truckPayload.type;
    if (truckPayload.city !== undefined) truckData.city = truckPayload.city;
    if (truckPayload.region !== undefined) truckData.region = truckPayload.region;
    if (truckPayload.district !== undefined) truckData.district = truckPayload.district;
    if (truckPayload.address !== undefined) truckData.address = truckPayload.address;
    if (truckPayload.brand !== undefined) truckData.brand = truckPayload.brand;
    if (truckPayload.model !== undefined) truckData.model = truckPayload.model;
    if (truckPayload.year !== undefined) truckData.year = truckPayload.year ? Number(truckPayload.year) : null;
    if (truckPayload.color !== undefined) truckData.color = truckPayload.color;
    if (truckPayload.status !== undefined) {
      truckData.status = String(truckPayload.status).replace(/ /g, "_");
    }
  }

  const customerPayload = payload.customerProfile && typeof payload.customerProfile === "object"
    ? payload.customerProfile
    : null;
  const customerData = {};
  if (customerPayload) {
    if (customerPayload.city !== undefined) customerData.city = customerPayload.city;
    if (customerPayload.address !== undefined) customerData.address = customerPayload.address;
  }

  if (truckData.plateNumber) {
    const conflict = await prisma.truck.findFirst({
      where: {
        plateNumber: truckData.plateNumber,
        NOT: { driverId: id },
      },
      select: { id: true },
    });
    if (conflict) {
      const error = new Error("Plate number is already in use");
      error.status = 409;
      throw error;
    }
  }

  await withTransaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.user.update({ where: { id }, data });
    }

    if (Object.keys(truckData).length > 0 && previous.role === "driver") {
      if (previous.truck?.id) {
        await tx.truck.update({ where: { id: previous.truck.id }, data: truckData });
      } else {
        const error = new Error("Driver has no truck to update");
        error.status = 400;
        throw error;
      }
    }

    if (Object.keys(customerData).length > 0 && previous.role === "customer") {
      if (previous.customerProfile) {
        await tx.customerProfile.update({
          where: { userId: id },
          data: customerData,
        });
      } else {
        await tx.customerProfile.create({
          data: { userId: id, city: customerData.city || "", address: customerData.address || "" },
        });
      }
    }

    const safeChanges = {
      ...Object.fromEntries(Object.entries(data).filter(([key]) => key !== "passwordHash")),
      ...(Object.keys(truckData).length ? { truck: truckData } : {}),
      ...(Object.keys(customerData).length ? { customerProfile: customerData } : {}),
    };

    if (Object.keys(safeChanges).length > 0 || payload.password) {
      await tx.auditLog.create({
        data: auditFields({
          userId: actorId,
          action: payload.password ? "password.changed" : action,
          entityType: "users",
          entityId: id,
          description: payload.password ? "User password changed" : "User profile or account updated",
          oldValues: {
            name: previous.name,
            email: previous.email,
            phone: previous.phone,
            status: previous.status,
            role: previous.role,
            driverLicense: previous.driverLicense,
            truck: previous.truck
              ? {
                  truckNumber: previous.truck.truckNumber,
                  plateNumber: previous.truck.plateNumber,
                  capacity: previous.truck.capacity,
                  truckType: previous.truck.truckType,
                  city: previous.truck.city,
                  region: previous.truck.region,
                  status: previous.truck.status,
                }
              : null,
            customerProfile: previous.customerProfile
              ? { city: previous.customerProfile.city, address: previous.customerProfile.address }
              : null,
          },
          newValues: safeChanges,
        }),
      });
    }
  });

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
      select: { role: true, status: true },
    });
    if (!user) return false;
    if (user.role === "admin") {
      const error = new Error("Admin users cannot be deleted");
      error.status = 403;
      throw error;
    }
    if (user.status === "Deleted") return false;

    await tx.auditLog.updateMany({
      where: { userId: id },
      data: { userId: null },
    });
    await tx.user.update({
      where: { id },
      data: {
        status: "Deleted",
        username: `deleted-${id}`,
        email: `deleted-${id}@deleted.local`,
        phone: null,
        nationalIdNumber: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    return true;
  });
},


};
