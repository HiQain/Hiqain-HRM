import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  jsonb,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";

export type PublicHoliday = {
  date: string;
  name: string;
  country?: "us" | "pk" | "other";
};

export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("HiQain"),
  defaultCasualLeaveQuota: integer("default_casual_leave_quota")
    .notNull()
    .default(6),
  defaultSickLeaveQuota: integer("default_sick_leave_quota")
    .notNull()
    .default(6),
  defaultAnnualLeaveQuota: integer("default_annual_leave_quota")
    .notNull()
    .default(12),
  defaultGracePeriodMinutes: integer("default_grace_period_minutes")
    .notNull()
    .default(15),
  defaultProbationMonths: integer("default_probation_months")
    .notNull()
    .default(3),
  defaultOfficeStartTime: text("default_office_start_time")
    .notNull()
    .default("09:00"),
  defaultOfficeEndTime: text("default_office_end_time")
    .notNull()
    .default("18:00"),
  weeklyOffDays: jsonb("weekly_off_days")
    .$type<number[]>()
    .notNull()
    .default([0, 6]),
  publicHolidays: jsonb("public_holidays")
    .$type<PublicHoliday[]>()
    .notNull()
    .default([]),
  proRatedQuotas: boolean("pro_rated_quotas").notNull().default(true),
  weeklyHours: integer("weekly_hours").notNull().default(40),
  monthlyHours: integer("monthly_hours").notNull().default(176),
  attendancePolicy: text("attendance_policy").notNull().default(""),
  attendancePolicyFileUrl: text("attendance_policy_file_url")
    .notNull()
    .default(""),
  attendancePolicyFileName: text("attendance_policy_file_name")
    .notNull()
    .default(""),
  basicSalaryPercent: numeric("basic_salary_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("50"),
  allowancePercent: numeric("allowance_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("50"),
  providentFundEnabled: boolean("provident_fund_enabled")
    .notNull()
    .default(false),
  defaultProvidentFundPercent: numeric("default_provident_fund_percent", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("5"),
  companyPolicy: text("company_policy").notNull().default(""),
  companyPolicyFileUrl: text("company_policy_file_url").notNull().default(""),
  companyPolicyFileName: text("company_policy_file_name").notNull().default(""),
  loanMinTenureMonths: integer("loan_min_tenure_months").notNull().default(12),
  loanMaxSalaryMultiplier: numeric("loan_max_salary_multiplier", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("1"),
  loanDefaultMonths: integer("loan_default_months").notNull().default(6),
  lateGraceCount: integer("late_grace_count").notNull().default(2),
  lateDeductionFraction: numeric("late_deduction_fraction", {
    precision: 4,
    scale: 2,
  })
    .notNull()
    .default("0.5"),
  lateAbsenceEvery: integer("late_absence_every").notNull().default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
