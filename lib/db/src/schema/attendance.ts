import {
  pgTable,
  serial,
  integer,
  date,
  timestamp,
  text,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const attendanceTable = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    checkInTime: timestamp("check_in_time", { withTimezone: true }),
    checkOutTime: timestamp("check_out_time", { withTimezone: true }),
    workedMinutes: integer("worked_minutes"),
    status: text("status", {
      enum: [
        "present",
        "late",
        "absent",
        "on_leave",
        "half_day",
        "remote_work",
      ],
    })
      .notNull()
      .default("present"),
    isLate: boolean("is_late").notNull().default(false),
    excused: boolean("excused").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqEmpDate: uniqueIndex("attendance_emp_date_unique").on(
      t.employeeId,
      t.date,
    ),
  }),
);

export type Attendance = typeof attendanceTable.$inferSelect;
export type InsertAttendance = typeof attendanceTable.$inferInsert;
