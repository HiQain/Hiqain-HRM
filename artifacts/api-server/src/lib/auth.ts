import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import type { RowDataPacket } from "mysql2";

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
  isActive: boolean;
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

function isMissingColumnError(error: unknown, columnName: string): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("unknown column") &&
    error.message.toLowerCase().includes(columnName.toLowerCase())
  );
}

type SessionUserRow = {
  id: number;
  email: string;
  role: Role;
  isActive: unknown;
  mustChangePassword: unknown;
  employeeId: number | null;
  name: string | null;
  avatarUrl: string | null;
};

type LegacyUserRow = RowDataPacket & {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  must_change_password: number | boolean;
  created_at: Date | string;
};

type LegacySessionUserRow = RowDataPacket & {
  id: number;
  email: string;
  role: Role;
  must_change_password: number | boolean;
  employeeId: number | null;
  name: string | null;
  avatarUrl: string | null;
};

export async function getUserByEmail(email: string) {
  try {
    const [rows] = await pool.execute<LegacyUserRow[]>(
      `SELECT id, email, password_hash, role, must_change_password, created_at
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email.toLowerCase()],
    );
    const user = rows[0];
    return user
      ? {
          id: user.id,
          email: user.email,
          passwordHash: user.password_hash,
          role: user.role,
          mustChangePassword: user.must_change_password,
          createdAt:
            user.created_at instanceof Date
              ? user.created_at
              : new Date(user.created_at),
          isActive: true,
        }
      : null;
  } catch (error) {
    if (!isMissingColumnError(error, "is_active")) throw error;
    return null;
  }
}

async function getSessionUserRow(userId: number): Promise<SessionUserRow | null> {
  try {
    const [rows] = await pool.execute<LegacySessionUserRow[]>(
      `SELECT
         users.id,
         users.email,
         users.role,
         users.must_change_password,
         employees.id AS employeeId,
         employees.name,
         employees.avatar_url AS avatarUrl
       FROM users
       LEFT JOIN employees ON employees.user_id = users.id
       WHERE users.id = ?
       LIMIT 1`,
      [userId],
    );

    const row = rows[0];
    return row
      ? {
          id: row.id,
          email: row.email,
          role: row.role,
          isActive: true,
          mustChangePassword: row.must_change_password,
          employeeId: row.employeeId,
          name: row.name,
          avatarUrl: row.avatarUrl,
        }
      : null;
  } catch (error) {
    if (!isMissingColumnError(error, "is_active")) throw error;
    return null;
  }
}

export async function getSessionUser(
  req: Request,
): Promise<SessionUser | null> {
  if (!req.session.userId) return null;
  const userId = req.session.userId;

  const row = await getSessionUserRow(userId);
  if (!row) return null;
  if (!toBooleanFlag(row.isActive)) return null;

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    isActive: toBooleanFlag(row.isActive),
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
