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
        let effectiveUser = user;
        if (normalizeRole(user.role) === "teacher" && user.teacherApplicationStatus === "pending_review" && user.teacherReviewDeadline && user.teacherReviewDeadline.getTime() <= Date.now()) {
          const [converted] = await db.update(usersTable).set({
            role: "student",
            teacherApplicationStatus: "auto_converted",
            teacherReviewDeadline: null,
            subject: null,
            isManager: false,
            isPrefect: false,
          }).where(eq(usersTable.id, user.id)).returning();
          if (converted) effectiveUser = converted;
        }
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


