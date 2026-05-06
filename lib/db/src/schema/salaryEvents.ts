import {
  date,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const salaryEventsTable = mysqlTable("salary_events", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["bonus", "loan", "increment", "commission"]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  amountMode: mysqlEnum("amount_mode", ["fixed", "percentage"])
    .notNull()
    .default("fixed"),
  percentValue: decimal("percent_value", { precision: 6, scale: 2 }),
  date: date("date", { mode: "string" }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SalaryEvent = typeof salaryEventsTable.$inferSelect;
export type InsertSalaryEvent = typeof salaryEventsTable.$inferInsert;
