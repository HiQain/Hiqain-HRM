import { Router, type IRouter } from "express";
import { db, appSettingsTable, employeesTable, pool, type AppSettings } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();
const DEFAULT_LEAVE_QUOTAS = {
  casual: 6,
  sick: 6,
  annual: 12,
} as const;

type GeneratedHoliday = {
  date: string;
  name: string;
  country: "us" | "pk" | "other";
};

type StoredHoliday = {
  date: string;
  name: string;
  country?: unknown;
};

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isStoredHoliday(value: unknown): value is StoredHoliday {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as StoredHoliday).date === "string" &&
      typeof (value as StoredHoliday).name === "string",
  );
}

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
  return [
    ...findIslamicDatesInGregorianYear(year, 10, [1, 2, 3]).map((date, index) => ({
      date,
      name: `Eid-ul-Fitr - Day ${index + 1} (subject to moon sighting)`,
      country: "pk" as const,
    })),
    ...findIslamicDatesInGregorianYear(year, 12, [10, 11, 12]).map((date, index) => ({
      date,
      name: `Eid-ul-Adha - Day ${index + 1} (subject to moon sighting)`,
      country: "pk" as const,
    })),
    ...findIslamicDatesInGregorianYear(year, 1, [9, 10]).map((date, index) => ({
      date,
      name: `Muharram - ${index === 0 ? "9th" : "10th"} Muharram (subject to moon sighting)`,
      country: "pk" as const,
    })),
  ];
}

function buildDefaultPublicHolidays(year: number): GeneratedHoliday[] {
  return sortHolidays([
    { date: `${year}-01-01`, name: "New Year's Day", country: "us" },
    { date: `${year}-05-25`, name: "Memorial Day", country: "us" },
    ...buildPakistanMoonSightingHolidays(year),
    { date: `${year}-07-03`, name: "Independence Day", country: "us" },
    { date: `${year}-09-07`, name: "Labor Day", country: "us" },
    { date: `${year}-11-26`, name: "Thanksgiving Day", country: "us" },
    { date: `${year}-12-24`, name: "Christmas Day", country: "us" },
    { date: `${year}-12-25`, name: "Christmas Day", country: "us" },
    { date: `${year}-12-31`, name: "New Year's Eve", country: "us" },
  ]);
}

function buildLegacyUsAndMoonDefaults(year: number): GeneratedHoliday[] {
  return sortHolidays([
    { date: `${year}-01-01`, name: "New Year's Day", country: "us" },
    { date: `${year}-05-25`, name: "Memorial Day", country: "us" },
    ...buildPakistanMoonSightingHolidays(year),
    { date: `${year}-07-03`, name: "Independence Day", country: "us" },
    { date: `${year}-09-07`, name: "Labor Day", country: "us" },
    { date: `${year}-11-26`, name: "Thanksgiving Day", country: "us" },
    { date: `${year}-12-24`, name: "Christmas Day", country: "us" },
    { date: `${year}-12-25`, name: "Christmas Day", country: "us" },
    { date: `${year}-12-31`, name: "New Year's Eve", country: "us" },
  ]);
}

function buildLegacyFixedPakistanDefaults(year: number): GeneratedHoliday[] {
  return sortHolidays([
    { date: `${year}-02-05`, name: "Kashmir Day", country: "pk" },
    { date: `${year}-03-23`, name: "Pakistan Day", country: "pk" },
    { date: `${year}-05-01`, name: "Labour Day", country: "pk" },
    { date: `${year}-08-14`, name: "Independence Day", country: "pk" },
    { date: `${year}-11-09`, name: "Iqbal Day", country: "pk" },
    { date: `${year}-12-25`, name: "Quaid-e-Azam Day", country: "pk" },
  ]);
}

function buildLegacyCombinedDefaults(year: number): GeneratedHoliday[] {
  return sortHolidays([
    ...buildLegacyUsAndMoonDefaults(year).filter((holiday) => holiday.country === "us"),
    ...buildLegacyFixedPakistanDefaults(year),
  ]);
}

function buildLegacyCurrentLiveDefaults(year: number): GeneratedHoliday[] {
  return sortHolidays([
    { date: `${year}-01-01`, name: "New Year's Day", country: "us" },
    { date: `${year}-02-05`, name: "Kashmir Day", country: "pk" },
    { date: `${year}-03-23`, name: "Pakistan Day", country: "pk" },
    { date: `${year}-05-01`, name: "Labour Day", country: "pk" },
    { date: `${year}-05-25`, name: "Memorial Day", country: "us" },
    { date: `${year}-07-04`, name: "Independence Day", country: "us" },
    { date: `${year}-08-14`, name: "Independence Day", country: "pk" },
    { date: `${year}-09-07`, name: "Labor Day", country: "us" },
    { date: `${year}-11-09`, name: "Iqbal Day", country: "pk" },
    { date: `${year}-11-26`, name: "Thanksgiving Day", country: "us" },
    { date: `${year}-12-25`, name: "Christmas Day", country: "us" },
    { date: `${year}-12-25`, name: "Quaid-e-Azam Day", country: "pk" },
  ]);
}

function buildNormalizationCandidates(year: number) {
  const years = [year - 1, year, year + 1];
  return years.flatMap((candidateYear) => [
    buildPakistanMoonSightingHolidays(candidateYear),
    buildLegacyUsAndMoonDefaults(candidateYear),
    buildLegacyFixedPakistanDefaults(candidateYear),
    buildLegacyCombinedDefaults(candidateYear),
    buildLegacyCurrentLiveDefaults(candidateYear),
    buildDefaultPublicHolidays(candidateYear),
  ]);
}

function areSameHolidayLists(
  left: Array<{ date: string; name: string; country: "us" | "pk" | "other" }>,
  right: Array<{ date: string; name: string; country: "us" | "pk" | "other" }>,
): boolean {
  if (left.length !== right.length) return false;
  const leftKeys = sortHolidays(left).map(
    (holiday) => `${holiday.date}|${holiday.name}|${holiday.country}`,
  );
  const rightKeys = sortHolidays(right).map(
    (holiday) => `${holiday.date}|${holiday.name}|${holiday.country}`,
  );
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function normalizeStoredPublicHolidays(
  holidays: AppSettings["publicHolidays"] | null | undefined,
  year: number,
) {
  const normalized = sortHolidays(
    parseJsonArray(holidays)
      .filter(isStoredHoliday)
      .map((holiday) => ({
        date: toHolidayDate(holiday.date),
        name: holiday.name.trim(),
        country: toHolidayCountry(holiday.country) ?? "other",
      })),
  );

  if (normalized.length === 0) {
    return buildDefaultPublicHolidays(year);
  }

  const legacyCandidates = buildNormalizationCandidates(year);

  if (legacyCandidates.some((candidate) => areSameHolidayLists(normalized, candidate))) {
    return buildDefaultPublicHolidays(year);
  }

  return normalized;
}

function getEffectivePublicHolidays(settings: AppSettings) {
  return normalizeStoredPublicHolidays(
    settings.publicHolidays,
    new Date().getFullYear(),
  );
}

function normalizeWeeklyOffDays(value: unknown): number[] {
  return parseJsonArray(value)
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

function normalizeSettingsRecord(settings: AppSettings, year: number): AppSettings {
  const weeklyOffDays = normalizeWeeklyOffDays(settings.weeklyOffDays);
  return {
    ...settings,
    weeklyOffDays: weeklyOffDays.length ? weeklyOffDays : [0, 6],
    publicHolidays: normalizeStoredPublicHolidays(settings.publicHolidays, year),
  };
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
  const effectivePublicHolidays = getEffectivePublicHolidays(s);
  const holidaySet = new Set(effectivePublicHolidays.map((h) => h.date));
  const monthlyWorkingDays = computeWorkingDaysInMonth(
    today.getFullYear(),
    today.getMonth(),
    normalizeWeeklyOffDays(s.weeklyOffDays).length
      ? normalizeWeeklyOffDays(s.weeklyOffDays)
      : [0, 6],
    holidaySet,
  );
  const monthlyHours = Math.round(dailyHours * monthlyWorkingDays);

  const weeklyOffDays = normalizeWeeklyOffDays(s.weeklyOffDays);

  return {
    companyName: s.companyName,
    defaultCasualLeaveQuota: s.defaultCasualLeaveQuota,
    defaultSickLeaveQuota: s.defaultSickLeaveQuota,
    defaultAnnualLeaveQuota: s.defaultAnnualLeaveQuota,
    defaultGracePeriodMinutes: s.defaultGracePeriodMinutes,
    defaultProbationMonths: s.defaultProbationMonths,
    defaultOfficeStartTime: s.defaultOfficeStartTime,
    defaultOfficeEndTime: s.defaultOfficeEndTime,
    weeklyOffDays: weeklyOffDays.length ? weeklyOffDays : [0, 6],
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
  const year = new Date().getFullYear();
  if (rows.length) {
    let current = rows[0]!;
    const lastLeaveQuotaResetYear =
      typeof (current as AppSettings & { lastLeaveQuotaResetYear?: unknown }).lastLeaveQuotaResetYear === "number"
        ? Number(
            (current as AppSettings & { lastLeaveQuotaResetYear?: unknown }).lastLeaveQuotaResetYear,
          )
        : 0;
    if (lastLeaveQuotaResetYear !== year) {
      await db.transaction(async (tx) => {
        await tx.update(employeesTable).set({
          casualLeaveQuota: current.defaultCasualLeaveQuota ?? DEFAULT_LEAVE_QUOTAS.casual,
          sickLeaveQuota: current.defaultSickLeaveQuota ?? DEFAULT_LEAVE_QUOTAS.sick,
          annualLeaveQuota: current.defaultAnnualLeaveQuota ?? DEFAULT_LEAVE_QUOTAS.annual,
        });
        await tx.execute(
          sql`UPDATE app_settings SET last_leave_quota_reset_year = ${year}, updated_at = NOW() WHERE id = ${current.id}`,
        );
      });
      const refreshedRows = await db.select().from(appSettingsTable).limit(1);
      current = refreshedRows[0]!;
    }
    const normalizedPublicHolidays = normalizeStoredPublicHolidays(
      current.publicHolidays,
      year,
    );
    const currentPublicHolidays = sortHolidays(
      parseJsonArray(current.publicHolidays)
        .filter(isStoredHoliday)
        .map((holiday) => ({
          date: toHolidayDate(holiday.date),
          name: holiday.name.trim(),
          country: toHolidayCountry(holiday.country) ?? "other",
        })),
    );
    if (areSameHolidayLists(currentPublicHolidays, normalizedPublicHolidays)) {
      return normalizeSettingsRecord(current, year);
    }
    await db
      .update(appSettingsTable)
      .set({
        publicHolidays: normalizedPublicHolidays,
        updatedAt: new Date(),
      })
      .where(eq(appSettingsTable.id, current.id));
    const seededRows = await db.select().from(appSettingsTable).limit(1);
    return normalizeSettingsRecord(seededRows[0]!, year);
  }
  await db.insert(appSettingsTable).values({
    defaultCasualLeaveQuota: DEFAULT_LEAVE_QUOTAS.casual,
    defaultSickLeaveQuota: DEFAULT_LEAVE_QUOTAS.sick,
    defaultAnnualLeaveQuota: DEFAULT_LEAVE_QUOTAS.annual,
    publicHolidays: buildDefaultPublicHolidays(year),
  });
  const nextRows = await db.select().from(appSettingsTable).limit(1);
  if (nextRows[0]?.id) {
    await pool.execute(
      "UPDATE app_settings SET last_leave_quota_reset_year = ?, updated_at = NOW() WHERE id = ?",
      [year, nextRows[0].id],
    );
  }
  const seededRows = await db.select().from(appSettingsTable).limit(1);
  return normalizeSettingsRecord(seededRows[0]!, year);
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
  if (data.publicHolidays !== undefined) {
    updates.publicHolidays = sortHolidays(
      data.publicHolidays
        .filter((holiday) => holiday.date && holiday.name.trim())
        .map((holiday) => ({
          date: toHolidayDate(holiday.date),
          name: holiday.name.trim(),
          country: toHolidayCountry(holiday.country) ?? "other",
        })),
    );
  }
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
