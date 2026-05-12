import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

export type Role = "admin" | "hr" | "employee";

export type SessionUser = {
  id: number;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  name: string;
  employeeId: number | null;
  avatarUrl: string | null;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function toBooleanFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export async function getSessionUser(
  req: Request,
): Promise<SessionUser | null> {
  if (!req.session.userId) return null;
  const userId = req.session.userId;

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      mustChangePassword: usersTable.mustChangePassword,
      employeeId: employeesTable.id,
      name: employeesTable.name,
      avatarUrl: employeesTable.avatarUrl,
    })
    .from(usersTable)
    .leftJoin(employeesTable, eq(employeesTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    mustChangePassword: toBooleanFlag(row.mustChangePassword),
    employeeId: row.employeeId,
    avatarUrl: row.avatarUrl ?? null,
    name:
      row.name ??
      (row.role === "admin"
        ? "Administrator"
        : row.role === "hr"
          ? "HR"
          : row.email),
  };
}

export function requireAuth(roles?: Array<Role>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await getSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    if (roles && !roles.includes(user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    (req as Request & { user: SessionUser }).user = user;
    return next();
  };
}

export function getUser(req: Request): SessionUser {
  return (req as Request & { user: SessionUser }).user;
}
