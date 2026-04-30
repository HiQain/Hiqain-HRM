import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const salaryEventsTable = pgTable("salary_events", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["bonus", "loan", "increment", "commission"],
  }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  amountMode: text("amount_mode", { enum: ["fixed", "percentage"] })
    .notNull()
    .default("fixed"),
  percentValue: numeric("percent_value", { precision: 6, scale: 2 }),
  date: date("date").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SalaryEvent = typeof salaryEventsTable.$inferSelect;
export type InsertSalaryEvent = typeof salaryEventsTable.$inferInsert;
