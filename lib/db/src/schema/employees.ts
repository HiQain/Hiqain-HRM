import {
  pgTable,
  serial,
  text,
  integer,
  date,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  position: text("position"),
  department: text("department"),
  positionType: text("position_type", { enum: ["onsite", "remote"] })
    .notNull()
    .default("onsite"),
  joiningDate: date("joining_date").notNull(),
  probationMonths: integer("probation_months").notNull().default(3),
  officeStartTime: text("office_start_time").notNull().default("09:00"),
  officeEndTime: text("office_end_time").notNull().default("18:00"),
  gracePeriodMinutes: integer("grace_period_minutes").notNull().default(15),
  basicSalary: numeric("basic_salary", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  allowances: numeric("allowances", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  casualLeaveQuota: integer("casual_leave_quota").notNull().default(10),
  sickLeaveQuota: integer("sick_leave_quota").notNull().default(10),
  annualLeaveQuota: integer("annual_leave_quota").notNull().default(14),
  dateOfBirth: date("date_of_birth"),
  education: text("education"),
  address: text("address"),
  avatarUrl: text("avatar_url"),
  // New fields
  employeeCode: text("employee_code"),
  leftDate: date("left_date"),
  emergencyContact: text("emergency_contact"),
  cnic: text("cnic"),
  lastQualification: text("last_qualification"),
  previousCompany: text("previous_company"),
  lastPay: numeric("last_pay", { precision: 12, scale: 2 }),
  benefits: text("benefits"),
  notes: text("notes"),
  immediateFamily: text("immediate_family"),
  employmentContractUrl: text("employment_contract_url"),
  employmentContractName: text("employment_contract_name"),
  cnicDocumentUrl: text("cnic_document_url"),
  cnicDocumentName: text("cnic_document_name"),
  bankAccountTitle: text("bank_account_title"),
  bankAccountNumber: text("bank_account_number"),
  bankName: text("bank_name"),
  bankIban: text("bank_iban"),
  bankBranchCode: text("bank_branch_code"),
  providentFundPercent: numeric("provident_fund_percent", {
    precision: 5,
    scale: 2,
  }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Employee = typeof employeesTable.$inferSelect;
export type InsertEmployee = typeof employeesTable.$inferInsert;
