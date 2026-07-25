import { prisma } from "../../lib/prisma.js";
import { DEFAULT_ROLE_PERMISSIONS, mergeRolePermissions, PERMISSION_CATALOG } from "../../lib/permissions.js";

export const settingsRepository = {
  async getSettings() {
    const rows = await prisma.setting.findMany();
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    // Role permissions are fixed in code — not editable in Settings.
    return {
      ...settings,
      rolePermissions: mergeRolePermissions({}),
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
    return {
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.isSuperAdmin ? all : DEFAULT_ROLE_PERMISSIONS[user.role],
      catalog: PERMISSION_CATALOG,
    };
  },

  async updateRolePermissions() {
    const error = new Error("Role permissions are fixed and cannot be changed from Settings");
    error.status = 403;
    throw error;
  },

  async updateSettings(key, value) {
    return prisma.setting.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value },
    });
  },
};
