import {
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const salaryComponentsTable = mysqlTable("salary_components", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 255 }).notNull(),
  kind: mysqlEnum("kind", [
    "designation",
    "commission",
    "allowance",
    "provident_fund",
    "other",
  ])
    .notNull()
    .default("allowance"),
  valueType: mysqlEnum("value_type", ["fixed", "percentage"])
    .notNull()
    .default("fixed"),
  value: decimal("value", { precision: 12, scale: 2 }).notNull().default("0"),
  isDeduction: int("is_deduction").notNull().default(0),
  isTaxable: int("is_taxable").notNull().default(1),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SalaryComponent = typeof salaryComponentsTable.$inferSelect;
export type InsertSalaryComponent = typeof salaryComponentsTable.$inferInsert;
