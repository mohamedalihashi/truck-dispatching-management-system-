import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { mergeRolePermissions } from "../lib/permissions.js";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET is required when NODE_ENV=production");
}

const effectiveJwtSecret = jwtSecret || "local-development-only-secret";

export function signToken(user) {
  const payload = {
    sub: user.id,
    role: user.role,
    email: user.email
  };
  if (user.mustChangePassword) payload.mcp = true;
  return jwt.sign(payload, effectiveJwtSecret, { expiresIn: "8h" });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  Promise.resolve()
    .then(async () => {
      const payload = jwt.verify(token, effectiveJwtSecret);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          role: true,
          email: true,
          status: true,
          mustChangePassword: true,
          isSuperAdmin: true
        }
      });
      if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }
      // Always trust the database role so stale JWT claims cannot block customer actions.
      req.user = {
        sub: user.id,
        role: user.role,
        email: user.email,
        mcp: user.mustChangePassword ? true : undefined,
        isSuperAdmin: Boolean(user.isSuperAdmin)
      };
      next();
    })
    .catch(() => {
      res.status(401).json({ message: "Invalid or expired token" });
    });
}

/** Block API access until the user sets a new password (admin-created accounts). */
export function requirePasswordChanged(req, res, next) {
  if (req.user?.mcp) {
    return res.status(403).json({
      message: "You must change your password before continuing.",
      mustChangePassword: true
    });
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Insufficient permissions${req.user?.role ? ` for role "${req.user.role}"` : ""}`,
        requiredRoles: roles,
        currentRole: req.user?.role || null
      });
    }
    next();
  };
}

export async function requireSuperAdmin(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.sub },
      select: { role: true, isSuperAdmin: true },
    });
    if (!user || user.role !== "admin" || !user.isSuperAdmin) {
      return res.status(403).json({ message: "Super Admin permission required" });
    }
    req.isSuperAdmin = true;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (req.user?.isSuperAdmin) {
        req.isSuperAdmin = true;
        return next();
      }
      const user = await prisma.user.findUnique({
        where: { id: req.user?.sub },
        select: { role: true, isSuperAdmin: true },
      });
      if (!user) return res.status(401).json({ message: "Authentication required" });
      if (user.isSuperAdmin) {
        req.isSuperAdmin = true;
        return next();
      }
      const permissions = mergeRolePermissions({});
      if (!permissions[user.role]?.[permission]) {
        return res.status(403).json({ message: `Your role is not allowed to access ${permission}` });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
