import type { AppSettings, PublicHoliday } from "@workspace/db";
import { getTaxYearConfigs, type TaxYearConfig } from "./runtimeConfig";

type TaxSlab = {
  upTo?: number;
  baseTax: number;
  rate: number;
  threshold: number;
};

const TAX_YEAR_CONFIGS = getTaxYearConfigs();

function getTaxConfigForYear(taxYear: number): TaxYearConfig | undefined {
  const exact = TAX_YEAR_CONFIGS.find((item) => item.taxYear === taxYear);
  if (exact) return exact;

  return [...TAX_YEAR_CONFIGS]
    .sort((a, b) => a.taxYear - b.taxYear)
    .reverse()
    .find((item) => item.taxYear <= taxYear);
}

export function getPakistanTaxYear(month: number, year: number): number {
  return month >= 7 ? year + 1 : year;
}

export function computePakistanMonthlySalaryTax(
  monthlyTaxableSalary: number,
  month: number,
  year: number,
): number {
  const annualSalary = Math.max(0, monthlyTaxableSalary) * 12;
  const taxYear = getPakistanTaxYear(month, year);
  const config = getTaxConfigForYear(taxYear);
  if (!config) return 0;

  const slabs = config.slabs;
  const slab = slabs.find((item) => item.upTo == null || annualSalary <= item.upTo);
  if (!slab) return 0;

  let annualTax = slab.baseTax + Math.max(0, annualSalary - slab.threshold) * slab.rate;
  if (
    config.surchargeThreshold != null &&
    config.surchargeRate != null &&
    annualSalary > config.surchargeThreshold
  ) {
    annualTax *= 1 + config.surchargeRate;
  }

  return Math.round((annualTax / 12) * 100) / 100;
}

export function toHolidaySet(settings: AppSettings): Set<string> {
  return new Set(
    ((settings.publicHolidays ?? []) as PublicHoliday[]).map((holiday) => holiday.date),
  );
}

export function isPayrollOffDay(
  dateIso: string,
  settings: AppSettings,
  holidaySet = toHolidaySet(settings),
): boolean {
  const date = new Date(`${dateIso}T00:00:00`);
  const weeklyOffDays = settings.weeklyOffDays ?? [0, 6];
  return weeklyOffDays.includes(date.getDay()) || holidaySet.has(dateIso);
}

export function computePayrollWorkingDaysInMonth(
  year: number,
  month: number,
  settings: AppSettings,
): number {
  const holidaySet = toHolidaySet(settings);
  const weeklyOffDays = new Set(settings.weeklyOffDays ?? [0, 6]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (weeklyOffDays.has(date.getUTCDay())) continue;
    if (holidaySet.has(iso)) continue;
    count += 1;
  }

  return count;
}
