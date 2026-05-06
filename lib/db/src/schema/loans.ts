import {
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const loansTable = mysqlTable("loans", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  requestId: int("request_id"),
  principalAmount: decimal("principal_amount", { precision: 12, scale: 2 })
    .notNull(),
  monthsToRepay: int("months_to_repay").notNull(),
  startMonth: int("start_month").notNull(),
  startYear: int("start_year").notNull(),
  status: mysqlEnum("status", ["active", "closed", "cancelled"])
    .notNull()
    .default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const loanInstallmentsTable = mysqlTable("loan_installments", {
  id: int("id").autoincrement().primaryKey(),
  loanId: int("loan_id")
    .notNull()
    .references(() => loansTable.id, { onDelete: "cascade" }),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  month: int("month").notNull(),
  year: int("year").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  payslipId: int("payslip_id"),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
});

export type Loan = typeof loansTable.$inferSelect;
export type InsertLoan = typeof loansTable.$inferInsert;
export type LoanInstallment = typeof loanInstallmentsTable.$inferSelect;
