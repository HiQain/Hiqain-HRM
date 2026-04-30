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

export const remoteWorkRequestsTable = pgTable("remote_work_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
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

export type RemoteWorkRequest = typeof remoteWorkRequestsTable.$inferSelect;
export type InsertRemoteWorkRequest =
  typeof remoteWorkRequestsTable.$inferInsert;
