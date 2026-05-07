import { Router, type IRouter } from "express";
import {
  db,
  appSettingsTable,
  employeesTable,
  type AppSettings,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

type GeneratedHoliday = {
  date: string;
  name: string;
  country: "us" | "pk" | "other";
};

function toHolidayCountry(value: unknown): "us" | "pk" | "other" | undefined {
  return value === "us" || value === "pk" || value === "other"
    ? value
    : undefined;
}

function toHolidayDate(value: string | Date): string {
  return typeof value === "string"
    ? value
    : value.toISOString().slice(0, 10);
}

function sortHolidays<T extends { date: string; name: string }>(holidays: T[]): T[] {
  return [...holidays].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    return byDate !== 0 ? byDate : a.name.localeCompare(b.name);
  });
}

function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  occurrence: number,
): string {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  date.setUTCDate(date.getUTCDate() + (occurrence - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function lastWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
): string {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

function observedUsHoliday(
  year: number,
  monthIndex: number,
  day: number,
): string {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function findIslamicDatesInGregorianYear(
  year: number,
  month: number,
  days: number[],
): string[] {
  const formatter = new Intl.DateTimeFormat("en-TN-u-ca-islamic", {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  });
  const wanted = new Set(days);
  const matches = new Map<number, string>();

  for (
    let date = new Date(Date.UTC(year, 0, 1));
    date.getUTCFullYear() === year;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const parts = formatter.formatToParts(date);
    const islamicMonth = Number(
      parts.find((part) => part.type === "month")?.value ?? "0",
    );
    const islamicDay = Number(
      parts.find((part) => part.type === "day")?.value ?? "0",
    );
    if (islamicMonth === month && wanted.has(islamicDay)) {
      matches.set(islamicDay, date.toISOString().slice(0, 10));
    }
  }

  return days
    .map((day) => matches.get(day))
    .filter((value): value is string => Boolean(value));
}

function buildPakistanMoonSightingHolidays(year: number): GeneratedHoliday[] {
  const mapHoliday = (
    dates: string[],
    name: string,
  ): GeneratedHoliday[] =>
    dates.map((date) => ({
      date,
      name: `${name} (subject to moon sighting)`,
      country: "pk",
    }));

  return [
    ...mapHoliday(
      findIslamicDatesInGregorianYear(year, 10, [1, 2, 3]),
      "Eid-ul-Fitr",
    ),
    ...mapHoliday(
      findIslamicDatesInGregorianYear(year, 12, [10, 11, 12]),
      "Eid-ul-Adha",
    ),
    ...mapHoliday(
      findIslamicDatesInGregorianYear(year, 1, [9, 10]),
      "Muharram",
    ),
  ];
}

function buildDefaultPublicHolidays(year: number): GeneratedHoliday[] {
  const usFixedHolidays: GeneratedHoliday[] = [
    { date: `${year}-01-01`, name: "New Year's Day", country: "us" },
    { date: lastWeekdayOfMonth(year, 4, 1), name: "Memorial Day", country: "us" },
    {
      date: observedUsHoliday(year, 6, 4),
      name: "Independence Day",
      country: "us",
    },
    { date: nthWeekdayOfMonth(year, 8, 1, 1), name: "Labor Day", country: "us" },
    {
      date: nthWeekdayOfMonth(year, 10, 4, 4),
      name: "Thanksgiving Day",
      country: "us",
    },
    { date: `${year}-12-24`, name: "Christmas Day", country: "us" },
    { date: `${year}-12-25`, name: "Christmas Day", country: "us" },
    { date: `${year}-12-31`, name: "New Year's Eve", country: "us" },
  ];

  return sortHolidays([
    ...usFixedHolidays,
    ...buildPakistanMoonSightingHolidays(year),
  ]);
}

function getGeneratedPublicHolidays(_settings: AppSettings): GeneratedHoliday[] {
  return buildDefaultPublicHolidays(new Date().getFullYear());
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

function computeDailyHours(start: string, end: string): number {
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);
  const diffMin =
    endMinutes <= startMinutes
      ? 24 * 60 - startMinutes + endMinutes
      : endMinutes - startMinutes;
  return Math.round((diffMin / 60) * 100) / 100;
}

function computeWorkingDaysInMonth(
  year: number,
  monthIndex: number,
  offDays: number[],
  holidayDates: Set<string>,
): number {
  const offSet = new Set(offDays);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, monthIndex, d);
    if (offSet.has(date.getDay())) continue;
    const iso = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(
      d,
    ).padStart(2, "0")}`;
    if (holidayDates.has(iso)) continue;
    count++;
  }
  return count;
}

function serialize(s: AppSettings) {
  const dailyHours = computeDailyHours(
    s.defaultOfficeStartTime,
    s.defaultOfficeEndTime,
  );
  const workingDaysPerWeek = 7 - (s.weeklyOffDays?.length ?? 0);
  const weeklyHours = Math.round(dailyHours * workingDaysPerWeek);
  const today = new Date();
  const effectivePublicHolidays = getGeneratedPublicHolidays(s);
  const holidaySet = new Set(effectivePublicHolidays.map((h) => h.date));
  const monthlyWorkingDays = computeWorkingDaysInMonth(
    today.getFullYear(),
    today.getMonth(),
    s.weeklyOffDays ?? [0, 6],
    holidaySet,
  );
  const monthlyHours = Math.round(dailyHours * monthlyWorkingDays);

  return {
    companyName: s.companyName,
    defaultCasualLeaveQuota: s.defaultCasualLeaveQuota,
    defaultSickLeaveQuota: s.defaultSickLeaveQuota,
    defaultAnnualLeaveQuota: s.defaultAnnualLeaveQuota,
    defaultGracePeriodMinutes: s.defaultGracePeriodMinutes,
    defaultProbationMonths: s.defaultProbationMonths,
    defaultOfficeStartTime: s.defaultOfficeStartTime,
    defaultOfficeEndTime: s.defaultOfficeEndTime,
    weeklyOffDays: s.weeklyOffDays ?? [0, 6],
    publicHolidays: effectivePublicHolidays.map((h) => ({
      date: h.date,
      name: h.name,
      country: h.country ?? "other",
    })),
    proRatedQuotas: s.proRatedQuotas,
    dailyHours,
    weeklyHours,
    monthlyHours,
    attendancePolicy: s.attendancePolicy,
    attendancePolicyFileUrl: s.attendancePolicyFileUrl,
    attendancePolicyFileName: s.attendancePolicyFileName,
    basicSalaryPercent: Number(s.basicSalaryPercent),
    allowancePercent: Number(s.allowancePercent),
    providentFundEnabled: s.providentFundEnabled,
    defaultProvidentFundPercent: Number(s.defaultProvidentFundPercent),
    companyPolicy: s.companyPolicy,
    companyPolicyFileUrl: s.companyPolicyFileUrl,
    companyPolicyFileName: s.companyPolicyFileName,
    loanMinTenureMonths: s.loanMinTenureMonths,
    loanMaxSalaryMultiplier: Number(s.loanMaxSalaryMultiplier),
    loanDefaultMonths: s.loanDefaultMonths,
    lateGraceCount: s.lateGraceCount,
    lateDeductionFraction: Number(s.lateDeductionFraction),
    lateAbsenceEvery: s.lateAbsenceEvery,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(appSettingsTable).limit(1);
  if (rows.length) return rows[0]!;
  await db.insert(appSettingsTable).values({});
  const nextRows = await db.select().from(appSettingsTable).limit(1);
  return nextRows[0]!;
}

router.get("/settings", requireAuth(), async (_req, res) => {
  const s = await getSettings();
  res.json(serialize(s));
});

router.patch("/settings", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid settings payload" });
    return;
  }
  const data = parsed.data;
  const current = await getSettings();
  const updates: Partial<typeof appSettingsTable.$inferInsert> = {};
  if (data.companyName !== undefined) updates.companyName = data.companyName;
  if (data.defaultCasualLeaveQuota !== undefined)
    updates.defaultCasualLeaveQuota = data.defaultCasualLeaveQuota;
  if (data.defaultSickLeaveQuota !== undefined)
    updates.defaultSickLeaveQuota = data.defaultSickLeaveQuota;
  if (data.defaultAnnualLeaveQuota !== undefined)
    updates.defaultAnnualLeaveQuota = data.defaultAnnualLeaveQuota;
  if (data.defaultGracePeriodMinutes !== undefined)
    updates.defaultGracePeriodMinutes = data.defaultGracePeriodMinutes;
  if (data.defaultProbationMonths !== undefined)
    updates.defaultProbationMonths = data.defaultProbationMonths;
  if (data.defaultOfficeStartTime !== undefined)
    updates.defaultOfficeStartTime = data.defaultOfficeStartTime;
  if (data.defaultOfficeEndTime !== undefined)
    updates.defaultOfficeEndTime = data.defaultOfficeEndTime;
  if (data.weeklyOffDays !== undefined)
    updates.weeklyOffDays = data.weeklyOffDays;
  if (data.proRatedQuotas !== undefined)
    updates.proRatedQuotas = data.proRatedQuotas;
  if (data.attendancePolicy !== undefined)
    updates.attendancePolicy = data.attendancePolicy;
  if (data.attendancePolicyFileUrl !== undefined)
    updates.attendancePolicyFileUrl = data.attendancePolicyFileUrl;
  if (data.attendancePolicyFileName !== undefined)
    updates.attendancePolicyFileName = data.attendancePolicyFileName;
  if (data.basicSalaryPercent !== undefined)
    updates.basicSalaryPercent = String(data.basicSalaryPercent);
  if (data.allowancePercent !== undefined)
    updates.allowancePercent = String(data.allowancePercent);
  if (data.defaultProvidentFundPercent !== undefined) {
    updates.defaultProvidentFundPercent = String(
      data.defaultProvidentFundPercent,
    );
    // PF is enabled whenever a non-zero percent is configured.
    updates.providentFundEnabled = Number(data.defaultProvidentFundPercent) > 0;
  } else if (data.providentFundEnabled !== undefined) {
    updates.providentFundEnabled = data.providentFundEnabled;
  }
  if (data.companyPolicy !== undefined)
    updates.companyPolicy = data.companyPolicy;
  if (data.companyPolicyFileUrl !== undefined)
    updates.companyPolicyFileUrl = data.companyPolicyFileUrl;
  if (data.companyPolicyFileName !== undefined)
    updates.companyPolicyFileName = data.companyPolicyFileName;
  if (data.loanMinTenureMonths !== undefined)
    updates.loanMinTenureMonths = data.loanMinTenureMonths;
  if (data.loanMaxSalaryMultiplier !== undefined)
    updates.loanMaxSalaryMultiplier = String(data.loanMaxSalaryMultiplier);
  if (data.loanDefaultMonths !== undefined)
    updates.loanDefaultMonths = data.loanDefaultMonths;
  if (data.lateGraceCount !== undefined)
    updates.lateGraceCount = data.lateGraceCount;
  if (data.lateDeductionFraction !== undefined)
    updates.lateDeductionFraction = String(data.lateDeductionFraction);
  if (data.lateAbsenceEvery !== undefined)
    updates.lateAbsenceEvery = data.lateAbsenceEvery;
  updates.updatedAt = new Date();

  await db
    .update(appSettingsTable)
    .set(updates)
    .where(eq(appSettingsTable.id, current.id));

  // Always propagate leave quotas to every employee whenever the admin
  // submits any of those fields, even if the value matches what is already
  // stored. This keeps employee quotas in sync with the admin defaults
  // (the UI explicitly tells the admin this is what happens on save).
  const empUpdates: Record<string, number> = {};
  if (data.defaultCasualLeaveQuota !== undefined)
    empUpdates.casualLeaveQuota = data.defaultCasualLeaveQuota;
  if (data.defaultSickLeaveQuota !== undefined)
    empUpdates.sickLeaveQuota = data.defaultSickLeaveQuota;
  if (data.defaultAnnualLeaveQuota !== undefined)
    empUpdates.annualLeaveQuota = data.defaultAnnualLeaveQuota;
  if (Object.keys(empUpdates).length) {
    await db.update(employeesTable).set(empUpdates);
  }

  const next = await getSettings();
  res.json(serialize(next));
});

export default router;
