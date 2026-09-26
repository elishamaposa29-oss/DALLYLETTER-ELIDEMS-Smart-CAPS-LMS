// Auth middleware — extracts current user from Bearer token
import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { parseToken } from "../routes/auth";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      currentUser?: typeof usersTable.$inferSelect;
    }
  }
}

/** Normalize role values at the authentication boundary so legacy/case-variant
 * database values cannot silently disagree with route authorization checks. */
export function normalizeRole(role: unknown): string {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

/** Roles that have platform-owner privileges. */
export function isOwnerRole(role: unknown): boolean {
  return ["owner", "admin"].includes(normalizeRole(role));
}

/** Academic-content staff. Manager is an explicit staff flag in the existing
 * user model; it grants the same content-management capability as teacher,
 * but does not grant owner-only administration. */
export function canManageAcademicContent(user: NonNullable<Express.Request["currentUser"]>): boolean {
  const role = normalizeRole(user.role);
  return role === "teacher" || isOwnerRole(role) || user.isManager === true;
}

// Middleware that extracts user from token (non-blocking — user may be null)
export async function extractUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const parsed = parseToken(token);
    if (parsed) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.userId));
      if (user) {
        // Keep one canonical role representation throughout the request.
        req.currentUser = { ...user, role: normalizeRole(user.role) };
      }
    }
  }
  next();
}

// Middleware that requires authentication
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

// Middleware that requires owner role
export async function requireOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.currentUser || !isOwnerRole(req.currentUser.role)) {
    res.status(403).json({ error: "Owner access required" });
    return;
  }
  next();
}

// Middleware that requires teacher, manager, or owner role.
// Student/payment-health rules are deliberately not applied here: they belong
// to product-specific access decisions, not generic staff authorization.
export async function requireTeacherOrOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.currentUser || !canManageAcademicContent(req.currentUser)) {
    res.status(403).json({ error: "Teacher or manager access required" });
    return;
  }
  next();
}
