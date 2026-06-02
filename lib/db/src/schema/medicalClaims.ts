import {
  date,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";
import { usersTable } from "./users";

export const medicalClaimsTable = mysqlTable("medical_claims", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  createdByUserId: int("created_by_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  dependentRelation: mysqlEnum("dependent_relation", [
    "self",
    "spouse",
    "child",
  ])
    .notNull()
    .default("self"),
  dependentName: varchar("dependent_name", { length: 255 }),
  treatmentType: mysqlEnum("treatment_type", ["opd", "ipd"])
    .notNull()
    .default("opd"),
  claimDate: date("claim_date", { mode: "string" }).notNull(),
  hospitalName: varchar("hospital_name", { length: 255 }),
  doctorName: varchar("doctor_name", { length: 255 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  approvedAmount: decimal("approved_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  reviewNote: text("review_note"),
  attachmentUrl: varchar("attachment_url", { length: 1024 }),
  attachmentName: varchar("attachment_name", { length: 255 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected"])
    .notNull()
    .default("pending"),
  reviewedByUserId: int("reviewed_by_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MedicalClaim = typeof medicalClaimsTable.$inferSelect;
export type InsertMedicalClaim = typeof medicalClaimsTable.$inferInsert;
