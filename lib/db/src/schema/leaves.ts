import {
  pgTable,
  serial,
  integer,
  date,
  timestamp,
  text,
  jsonb,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const leaveRequestsTable = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["sick", "casual", "annual"] }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: integer("days").notNull(),
  reason: text("reason").notNull(),
  attachmentUrl: text("attachment_url"),
  attachmentName: text("attachment_name"),
  attachments: jsonb("attachments")
    .$type<{ url: string; name: string }[]>()
    .notNull()
    .default([]),
  mentionedEmployeeIds: jsonb("mentioned_employee_ids")
    .$type<number[]>()
    .notNull()
    .default([]),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequestsTable.$inferInsert;
