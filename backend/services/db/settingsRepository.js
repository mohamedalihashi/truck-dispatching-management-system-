import { prisma } from "../../lib/prisma.js";
import { getRolePermissions, invalidateRolePermissionsCache } from "../../lib/permissionsCache.js";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATALOG } from "../../lib/permissions.js";

export const settingsRepository = {
  async getSupportContact() {
    const row = await prisma.setting.findUnique({ where: { key: "general" } });
    const general = row?.value && typeof row.value === "object" ? row.value : {};
    return {
      supportEmail: general.supportEmail || process.env.SUPPORT_EMAIL || "support@truckdispatch.so",
      supportPhone: general.supportPhone || process.env.SUPPORT_PHONE || "+252 61 XXX XXXX",
    };
  },

  async getSettings() {
    const rows = await prisma.setting.findMany();
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      ...settings,
      rolePermissions: await getRolePermissions(),
      permissionCatalog: PERMISSION_CATALOG,
    };
  },

  async getPermissionsForUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isSuperAdmin: true },
    });
    if (!user) return null;
    const all = Object.fromEntries(PERMISSION_CATALOG.map(({ key }) => [key, true]));
    const rolePermissions = await getRolePermissions();
    return {
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.isSuperAdmin ? all : rolePermissions[user.role] || DEFAULT_ROLE_PERMISSIONS[user.role] || {},
      catalog: PERMISSION_CATALOG,
      rolePermissions,
    };
  },

  async updateRolePermissions(value = {}) {
    const { mergeRolePermissions } = await import("../../lib/permissions.js");
    const merged = mergeRolePermissions(value);
    const row = await prisma.setting.upsert({
      where: { key: "rolePermissions" },
      update: { value: merged, updatedAt: new Date() },
      create: { key: "rolePermissions", value: merged },
    });
    invalidateRolePermissionsCache();
    return { key: row.key, value: mergeRolePermissions(row.value) };
  },

  async updateSettings(key, value) {
    if (key === "rolePermissions") {
      return this.updateRolePermissions(value);
    }
    return prisma.setting.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value },
    });
  },
};
