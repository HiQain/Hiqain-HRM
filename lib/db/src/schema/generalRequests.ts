import {
  pgTable,
  serial,
  integer,
  date,
  timestamp,
  text,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const generalRequestsTable = pgTable("general_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["half_day", "loan", "increment", "remote_work", "late", "pf_withdrawal", "resignation", "other"],
  }).notNull(),
  date: date("date").notNull(),
  dateTo: date("date_to"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
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
  installmentMonths: integer("installment_months"),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export type GeneralRequest = typeof generalRequestsTable.$inferSelect;
export type InsertGeneralRequest = typeof generalRequestsTable.$inferInsert;
