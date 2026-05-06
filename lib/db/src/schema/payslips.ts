import {
  decimal,
  int,
  mysqlTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const payslipsTable = mysqlTable(
  "payslips",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: int("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    month: int("month").notNull(),
    year: int("year").notNull(),
    totalWorkingDays: int("total_working_days").notNull(),
    presentDays: int("present_days").notNull(),
    absentDays: int("absent_days").notNull(),
    paidLeaveDays: int("paid_leave_days").notNull().default(0),
    unpaidLeaveDays: int("unpaid_leave_days").notNull().default(0),
    lateCount: int("late_count").notNull().default(0),
    lateAbsenceDays: decimal("late_absence_days", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    basicSalary: decimal("basic_salary", { precision: 12, scale: 2 }).notNull(),
    allowances: decimal("allowances", { precision: 12, scale: 2 }).notNull(),
    bonus: decimal("bonus", { precision: 12, scale: 2 }).notNull().default("0"),
    loanDeduction: decimal("loan_deduction", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    otherDeductions: decimal("other_deductions", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    netSalary: decimal("net_salary", { precision: 12, scale: 2 }).notNull(),
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
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
