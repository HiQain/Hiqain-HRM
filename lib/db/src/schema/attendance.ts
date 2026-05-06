import {
  boolean,
  date,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  text,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

export const attendanceTable = mysqlTable(
  "attendance",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: int("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    checkInTime: timestamp("check_in_time"),
    checkOutTime: timestamp("check_out_time"),
    workedMinutes: int("worked_minutes"),
    pausedAt: timestamp("paused_at"),
    pausedMinutes: int("paused_minutes").notNull().default(0),
    status: mysqlEnum("status", [
      "present",
      "late",
      "absent",
      "on_leave",
      "half_day",
      "remote_work",
    ])
      .notNull()
      .default("present"),
    isLate: boolean("is_late").notNull().default(false),
    excused: boolean("excused").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
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
