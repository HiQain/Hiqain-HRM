import {
  date,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export type StandupExtraValues = Record<string, string>;

export const standupEntriesTable = mysqlTable("standup_entries", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  standupDate: date("standup_date", { mode: "string" }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  project: text("project").notNull(),
  working: text("working").notNull(),
  extraValues: json("extra_values")
    .$type<StandupExtraValues>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StandupEntry = typeof standupEntriesTable.$inferSelect;
export type InsertStandupEntry = typeof standupEntriesTable.$inferInsert;
