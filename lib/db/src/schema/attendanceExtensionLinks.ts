import {
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const attendanceExtensionLinksTable = mysqlTable(
  "attendance_extension_links",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: int("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["pending", "connected", "revoked"])
      .notNull()
      .default("pending"),
    connectionCode: varchar("connection_code", { length: 32 }),
    codeExpiresAt: timestamp("code_expires_at"),
    accessTokenHash: varchar("access_token_hash", { length: 128 }),
    deviceName: varchar("device_name", { length: 255 }),
    lastState: mysqlEnum("last_state", ["active", "idle", "locked", "offline"]),
    lastHeartbeatAt: timestamp("last_heartbeat_at"),
    lastActiveAt: timestamp("last_active_at"),
    lastIdleStartedAt: timestamp("last_idle_started_at"),
    browserAlive: tinyint("browser_alive", { unsigned: true }),
    networkOnline: tinyint("network_online", { unsigned: true }),
    extensionVersion: varchar("extension_version", { length: 32 }),
    disconnectedAt: timestamp("disconnected_at"),
    lastWarningAt: timestamp("last_warning_at"),
    autoPausedAt: timestamp("auto_paused_at"),
    connectedAt: timestamp("connected_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    uniqEmployee: uniqueIndex("attendance_extension_links_employee_unique").on(
      t.employeeId,
    ),
    uniqConnectionCode: uniqueIndex(
      "attendance_extension_links_code_unique",
    ).on(t.connectionCode),
    uniqAccessTokenHash: uniqueIndex(
      "attendance_extension_links_token_unique",
    ).on(t.accessTokenHash),
  }),
);

export type AttendanceExtensionLink =
  typeof attendanceExtensionLinksTable.$inferSelect;
export type InsertAttendanceExtensionLink =
  typeof attendanceExtensionLinksTable.$inferInsert;
