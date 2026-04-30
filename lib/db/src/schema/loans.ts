import {
  pgTable,
  serial,
  integer,
  numeric,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const loansTable = pgTable("loans", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  requestId: integer("request_id"),
  principalAmount: numeric("principal_amount", { precision: 12, scale: 2 })
    .notNull(),
  monthsToRepay: integer("months_to_repay").notNull(),
  startMonth: integer("start_month").notNull(),
  startYear: integer("start_year").notNull(),
  status: text("status", { enum: ["active", "closed", "cancelled"] })
    .notNull()
    .default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const loanInstallmentsTable = pgTable("loan_installments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id")
    .notNull()
    .references(() => loansTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  payslipId: integer("payslip_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Loan = typeof loansTable.$inferSelect;
export type InsertLoan = typeof loansTable.$inferInsert;
export type LoanInstallment = typeof loanInstallmentsTable.$inferSelect;
