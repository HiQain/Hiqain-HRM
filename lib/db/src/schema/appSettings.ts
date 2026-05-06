import {
  boolean,
  decimal,
  int,
  json,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export type PublicHoliday = {
  date: string;
  name: string;
  country?: "us" | "pk" | "other";
};

export const appSettingsTable = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("company_name", { length: 255 }).notNull().default("HiQain"),
  defaultCasualLeaveQuota: int("default_casual_leave_quota")
    .notNull()
    .default(6),
  defaultSickLeaveQuota: int("default_sick_leave_quota")
    .notNull()
    .default(6),
  defaultAnnualLeaveQuota: int("default_annual_leave_quota")
    .notNull()
    .default(12),
  defaultGracePeriodMinutes: int("default_grace_period_minutes")
    .notNull()
    .default(15),
  defaultProbationMonths: int("default_probation_months")
    .notNull()
    .default(3),
  defaultOfficeStartTime: varchar("default_office_start_time", { length: 16 })
    .notNull()
    .default("09:00"),
  defaultOfficeEndTime: varchar("default_office_end_time", { length: 16 })
    .notNull()
    .default("18:00"),
  weeklyOffDays: json("weekly_off_days")
    .$type<number[]>()
    .notNull()
    .default([0, 6]),
  publicHolidays: json("public_holidays")
    .$type<PublicHoliday[]>()
    .notNull()
    .default([]),
  proRatedQuotas: boolean("pro_rated_quotas").notNull().default(true),
  weeklyHours: int("weekly_hours").notNull().default(40),
  monthlyHours: int("monthly_hours").notNull().default(176),
  attendancePolicy: varchar("attendance_policy", { length: 2048 }).notNull().default(""),
  attendancePolicyFileUrl: varchar("attendance_policy_file_url", { length: 1024 })
    .notNull()
    .default(""),
  attendancePolicyFileName: varchar("attendance_policy_file_name", { length: 255 })
    .notNull()
    .default(""),
  basicSalaryPercent: decimal("basic_salary_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("50"),
  allowancePercent: decimal("allowance_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("50"),
  providentFundEnabled: boolean("provident_fund_enabled")
    .notNull()
    .default(false),
  defaultProvidentFundPercent: decimal("default_provident_fund_percent", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("5"),
  companyPolicy: varchar("company_policy", { length: 2048 }).notNull().default(""),
  companyPolicyFileUrl: varchar("company_policy_file_url", { length: 1024 }).notNull().default(""),
  companyPolicyFileName: varchar("company_policy_file_name", { length: 255 }).notNull().default(""),
  loanMinTenureMonths: int("loan_min_tenure_months").notNull().default(12),
  loanMaxSalaryMultiplier: decimal("loan_max_salary_multiplier", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("1"),
  loanDefaultMonths: int("loan_default_months").notNull().default(6),
  lateGraceCount: int("late_grace_count").notNull().default(2),
  lateDeductionFraction: decimal("late_deduction_fraction", {
    precision: 4,
    scale: 2,
  })
    .notNull()
    .default("0.5"),
  lateAbsenceEvery: int("late_absence_every").notNull().default(3),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
