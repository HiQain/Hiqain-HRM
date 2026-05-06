import {
  date,
  int,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const designationChangesTable = mysqlTable("designation_changes", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  fromTitle: varchar("from_title", { length: 255 }),
  toTitle: varchar("to_title", { length: 255 }).notNull(),
  effectiveDate: date("effective_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DesignationChange = typeof designationChangesTable.$inferSelect;
