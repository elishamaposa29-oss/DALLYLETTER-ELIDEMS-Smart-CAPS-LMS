// Auth middleware — extracts current user from Bearer token
import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { parseToken } from "../routes/auth";
import { normalizeRole, isOwnerRole, canManageAcademicContent, canAccessManager, enforceAuthenticated, enforceOwnerAccess, enforceAcademicStaffAccess } from "./role-access";
import { isAuthSessionActive } from "./auth-session-store";
export { normalizeRole, isOwnerRole, canManageAcademicContent, canAccessManager } from "./role-access";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      currentUser?: typeof usersTable.$inferSelect;
    }
  }
}

// Middleware that extracts user from token (non-blocking — user may be null)
export async function extractUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const parsed = parseToken(token);
    if (parsed && await isAuthSessionActive(token)) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.userId));
      if (user) {
        // Expired teacher applications are processed by the CV workflow only after
        // notification email is accepted. Authentication must never silently convert
        // a teacher account before the applicant has been informed.
        const effectiveUser = user;
        // Keep one canonical role representation throughout the request.
        if (!effectiveUser.isBlocked && !effectiveUser.isSuspended) req.currentUser = { ...effectiveUser, role: normalizeRole(effectiveUser.role) };
      }
    }
  }
  next();
}

// Middleware that requires authentication
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  enforceAuthenticated(req, res, next);
}

// Middleware that requires owner role
export async function requireOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  enforceOwnerAccess(req, res, next);
}

// Middleware that requires teacher, manager, or owner role.
// Student/payment-health rules are deliberately not applied here: they belong
// to product-specific access decisions, not generic staff authorization.
export async function requireTeacherOrOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  enforceAcademicStaffAccess(req, res, next);
}


