import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const salaryComponentsTable = pgTable("salary_components", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  kind: text("kind", {
    enum: ["designation", "commission", "allowance", "provident_fund", "other"],
  })
    .notNull()
    .default("allowance"),
  valueType: text("value_type", { enum: ["fixed", "percentage"] })
    .notNull()
    .default("fixed"),
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
  isDeduction: integer("is_deduction").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SalaryComponent = typeof salaryComponentsTable.$inferSelect;
export type InsertSalaryComponent = typeof salaryComponentsTable.$inferInsert;
