import {
  pgTable,
  serial,
  text,
  integer,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const designationChangesTable = pgTable("designation_changes", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  fromTitle: text("from_title"),
  toTitle: text("to_title").notNull(),
  effectiveDate: date("effective_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DesignationChange = typeof designationChangesTable.$inferSelect;
