import {
  date,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  text,
  varchar,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const leaveRequestsTable = mysqlTable("leave_requests", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["sick", "casual", "annual"]).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  days: int("days").notNull(),
  reason: text("reason").notNull(),
  attachmentUrl: varchar("attachment_url", { length: 1024 }),
  attachmentName: varchar("attachment_name", { length: 255 }),
  attachments: json("attachments")
    .$type<{ url: string; name: string }[]>()
    .notNull()
    .default([]),
  mentionedEmployeeIds: json("mentioned_employee_ids")
    .$type<number[]>()
    .notNull()
    .default([]),
  status: mysqlEnum("status", ["pending", "approved", "rejected"])
    .notNull()
    .default("pending"),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequestsTable.$inferInsert;
