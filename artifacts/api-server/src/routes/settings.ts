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

function parseTime(t: string): number {
  const [h, m] = t.split(":").map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

function computeDailyHours(start: string, end: string): number {
  const diffMin = Math.max(0, parseTime(end) - parseTime(start));
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
  const holidaySet = new Set(
    (s.publicHolidays ?? []).map((h) => h.date),
  );
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
    publicHolidays: (s.publicHolidays ?? []).map((h) => ({
      date: h.date,
      name: h.name,
      country: (h as { country?: string }).country ?? "other",
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
  const inserted = await db.insert(appSettingsTable).values({}).returning();
  return inserted[0]!;
}

router.get("/settings", requireAuth(), async (_req, res) => {
  const s = await getSettings();
  res.json(serialize(s));
});

router.patch("/settings", requireAuth(["admin", "hr"]), async (req, res) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid settings payload" });
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
  if (data.publicHolidays !== undefined)
    updates.publicHolidays = data.publicHolidays.map((h) => ({
      date:
        typeof h.date === "string"
          ? h.date
          : (h.date as Date).toISOString().slice(0, 10),
      name: h.name,
      country: h.country,
    }));
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
