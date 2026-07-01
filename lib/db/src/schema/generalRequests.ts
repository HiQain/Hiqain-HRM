import {
  date,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  text,
  varchar,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const generalRequestsTable = mysqlTable("general_requests", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", [
    "half_day",
    "early_off_no_break",
    "loan",
    "increment",
    "remote_work",
    "late",
    "pf_withdrawal",
    "resignation",
    "other",
  ]).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  dateTo: date("date_to", { mode: "string" }),
  amount: decimal("amount", { precision: 12, scale: 2 }),
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
  installmentMonths: int("installment_months"),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export type GeneralRequest = typeof generalRequestsTable.$inferSelect;
export type InsertGeneralRequest = typeof generalRequestsTable.$inferInsert;
