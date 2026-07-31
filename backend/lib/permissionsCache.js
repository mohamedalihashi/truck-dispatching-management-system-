import { prisma } from "./prisma.js";
import { mergeRolePermissions } from "./permissions.js";
import { getCached, invalidateCache } from "./cache.js";

const TTL_MS = 60_000;

export async function getRolePermissions() {
  return getCached("rolePermissions", TTL_MS, async () => {
    const stored = await prisma.setting.findUnique({ where: { key: "rolePermissions" } });
    return mergeRolePermissions(
      stored?.value && typeof stored.value === "object" ? stored.value : {}
    );
  });
}

export function invalidateRolePermissionsCache() {
  invalidateCache("rolePermissions");
}
