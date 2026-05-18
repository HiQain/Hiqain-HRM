import { db, employeesTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

type NotificationPayload = {
  type?: string;
  title: string;
  message: string;
  href?: string | null;
};

export async function notifyUser(userId: number, payload: NotificationPayload) {
  await db.insert(notificationsTable).values({
    userId,
    type: payload.type ?? "system",
    title: payload.title,
    message: payload.message,
    href: payload.href ?? null,
  });
}

export async function notifyUsers(userIds: number[], payload: NotificationPayload) {
  const uniqueUserIds = Array.from(new Set(userIds.filter((value) => value > 0)));
  if (uniqueUserIds.length === 0) return;

  await db.insert(notificationsTable).values(
    uniqueUserIds.map((userId) => ({
      userId,
      type: payload.type ?? "system",
      title: payload.title,
      message: payload.message,
      href: payload.href ?? null,
    })),
  );
}

export async function notifyRoles(
  roles: Array<"admin" | "hr" | "employee">,
  payload: NotificationPayload,
) {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.role, roles));
  await notifyUsers(
    rows.map((row) => row.id),
    payload,
  );
}

export async function notifyEmployeeUser(employeeId: number, payload: NotificationPayload) {
  const rows = await db
    .select({ userId: employeesTable.userId })
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  const userId = rows[0]?.userId;
  if (!userId) return;
  await notifyUser(userId, payload);
}
