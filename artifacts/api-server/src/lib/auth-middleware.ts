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

// Middleware that extracts user from token (non-blocking — user may be null)
export async function extractUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const parsed = parseToken(token);
    if (parsed) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.userId));
      if (user) {
        req.currentUser = user;
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
  if (!req.currentUser || req.currentUser.role !== "owner") {
    res.status(403).json({ error: "Owner access required" });
    return;
  }
  next();
}

// Middleware that requires teacher or owner role
export async function requireTeacherOrOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.currentUser || !["teacher", "owner"].includes(req.currentUser.role)) {
    res.status(403).json({ error: "Teacher or owner access required" });
    return;
  }
  next();
}
