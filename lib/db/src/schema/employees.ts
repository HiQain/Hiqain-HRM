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
import { usersTable } from "./users";

export const employeesTable = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique(),
  name: varchar("name", { length: 255 }).notNull(),
  personalEmail: varchar("personal_email", { length: 255 }),
  phone: varchar("phone", { length: 64 }),
  position: varchar("position", { length: 255 }),
  department: varchar("department", { length: 255 }),
  positionType: mysqlEnum("position_type", ["onsite", "remote"])
    .notNull()
    .default("onsite"),
  joiningDate: date("joining_date", { mode: "string" }).notNull(),
  probationMonths: int("probation_months").notNull().default(3),
  officeStartTime: varchar("office_start_time", { length: 16 }).notNull().default("09:00"),
  officeEndTime: varchar("office_end_time", { length: 16 }).notNull().default("18:00"),
  gracePeriodMinutes: int("grace_period_minutes").notNull().default(15),
  basicSalary: decimal("basic_salary", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  allowances: decimal("allowances", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  casualLeaveQuota: int("casual_leave_quota").notNull().default(10),
  sickLeaveQuota: int("sick_leave_quota").notNull().default(10),
  annualLeaveQuota: int("annual_leave_quota").notNull().default(14),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  education: text("education"),
  address: text("address"),
  avatarUrl: varchar("avatar_url", { length: 1024 }),
  employeeCode: varchar("employee_code", { length: 64 }),
  maritalStatus: text("marital_status"),
  wifeName: text("wife_name"),
  wifeDateOfBirth: text("wife_date_of_birth"),
  kidsCount: text("kids_count"),
  kidsNames: text("kids_names"),
  leftDate: date("left_date", { mode: "string" }),
  emergencyContactName: varchar("emergency_contact_name", { length: 255 }),
  emergencyContactNumber: varchar("emergency_contact_number", { length: 64 }),
  emergencyContactRelation: text("emergency_contact_relation"),
  emergencyContact: varchar("emergency_contact", { length: 255 }),
  cnic: varchar("cnic", { length: 64 }),
  lastQualification: varchar("last_qualification", { length: 255 }),
  previousCompany: varchar("previous_company", { length: 255 }),
  lastPay: decimal("last_pay", { precision: 12, scale: 2 }),
  benefits: text("benefits"),
  notes: text("notes"),
  immediateFamily: text("immediate_family"),
  employmentContractUrl: varchar("employment_contract_url", { length: 1024 }),
  employmentContractName: varchar("employment_contract_name", { length: 255 }),
  cnicDocumentUrl: varchar("cnic_document_url", { length: 1024 }),
  cnicDocumentName: varchar("cnic_document_name", { length: 255 }),
  cnicFrontDocumentUrl: varchar("cnic_front_document_url", { length: 1024 }),
  cnicFrontDocumentName: varchar("cnic_front_document_name", { length: 255 }),
  cnicBackDocumentUrl: varchar("cnic_back_document_url", { length: 1024 }),
  cnicBackDocumentName: varchar("cnic_back_document_name", { length: 255 }),
  qualificationDocumentUrl: varchar("qualification_document_url", {
    length: 1024,
  }),
  qualificationDocumentName: varchar("qualification_document_name", {
    length: 255,
  }),
  lastPayslipOneUrl: varchar("last_payslip_one_url", { length: 1024 }),
  lastPayslipOneName: varchar("last_payslip_one_name", { length: 255 }),
  lastPayslipTwoUrl: varchar("last_payslip_two_url", { length: 1024 }),
  lastPayslipTwoName: varchar("last_payslip_two_name", { length: 255 }),
  lastPayslipThreeUrl: varchar("last_payslip_three_url", { length: 1024 }),
  lastPayslipThreeName: varchar("last_payslip_three_name", { length: 255 }),
  bankAccountTitle: varchar("bank_account_title", { length: 255 }),
  bankAccountNumber: varchar("bank_account_number", { length: 255 }),
  bankName: varchar("bank_name", { length: 255 }),
  bankIban: varchar("bank_iban", { length: 64 }),
  bankBranchCode: varchar("bank_branch_code", { length: 64 }),
  primaryBankAccountTitle: varchar("primary_bank_account_title", {
    length: 255,
  }),
  primaryBankAccountNumber: varchar("primary_bank_account_number", {
    length: 255,
  }),
  primaryBankName: varchar("primary_bank_name", { length: 255 }),
  primaryBankIban: varchar("primary_bank_iban", { length: 64 }),
  primaryBankBranchCode: varchar("primary_bank_branch_code", { length: 64 }),
  secondaryBankAccountTitle: varchar("secondary_bank_account_title", {
    length: 255,
  }),
  secondaryBankAccountNumber: varchar("secondary_bank_account_number", {
    length: 255,
  }),
  secondaryBankName: varchar("secondary_bank_name", { length: 255 }),
  secondaryBankIban: varchar("secondary_bank_iban", { length: 64 }),
  secondaryBankBranchCode: varchar("secondary_bank_branch_code", {
    length: 64,
  }),
  providentFundPercent: decimal("provident_fund_percent", {
    precision: 5,
    scale: 2,
  }).default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Employee = typeof employeesTable.$inferSelect;
export type InsertEmployee = typeof employeesTable.$inferInsert;
