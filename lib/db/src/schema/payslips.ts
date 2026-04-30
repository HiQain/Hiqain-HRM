import {
  pgTable,
  serial,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const payslipsTable = pgTable(
  "payslips",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    totalWorkingDays: integer("total_working_days").notNull(),
    presentDays: integer("present_days").notNull(),
    absentDays: integer("absent_days").notNull(),
    paidLeaveDays: integer("paid_leave_days").notNull().default(0),
    unpaidLeaveDays: integer("unpaid_leave_days").notNull().default(0),
    lateCount: integer("late_count").notNull().default(0),
    lateAbsenceDays: numeric("late_absence_days", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    basicSalary: numeric("basic_salary", { precision: 12, scale: 2 }).notNull(),
    allowances: numeric("allowances", { precision: 12, scale: 2 }).notNull(),
    bonus: numeric("bonus", { precision: 12, scale: 2 }).notNull().default("0"),
    loanDeduction: numeric("loan_deduction", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    otherDeductions: numeric("other_deductions", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    netSalary: numeric("net_salary", { precision: 12, scale: 2 }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqEmpMonth: uniqueIndex("payslip_emp_month_unique").on(
      t.employeeId,
      t.month,
      t.year,
    ),
  }),
);

export type Payslip = typeof payslipsTable.$inferSelect;
export type InsertPayslip = typeof payslipsTable.$inferInsert;
