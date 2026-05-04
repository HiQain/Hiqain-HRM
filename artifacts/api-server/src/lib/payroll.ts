import type { AppSettings, PublicHoliday } from "@workspace/db";

type TaxSlab = {
  upTo?: number;
  baseTax: number;
  rate: number;
  threshold: number;
};

const SALARY_TAX_SLABS: Record<number, TaxSlab[]> = {
  2025: [
    { upTo: 600_000, baseTax: 0, rate: 0, threshold: 0 },
    { upTo: 1_200_000, baseTax: 0, rate: 0.05, threshold: 600_000 },
    { upTo: 2_200_000, baseTax: 30_000, rate: 0.15, threshold: 1_200_000 },
    { upTo: 3_200_000, baseTax: 180_000, rate: 0.25, threshold: 2_200_000 },
    { upTo: 4_100_000, baseTax: 430_000, rate: 0.3, threshold: 3_200_000 },
    { baseTax: 700_000, rate: 0.35, threshold: 4_100_000 },
  ],
  2026: [
    { upTo: 600_000, baseTax: 0, rate: 0, threshold: 0 },
    { upTo: 1_200_000, baseTax: 0, rate: 0.01, threshold: 600_000 },
    { upTo: 2_200_000, baseTax: 6_000, rate: 0.11, threshold: 1_200_000 },
    { upTo: 3_200_000, baseTax: 116_000, rate: 0.23, threshold: 2_200_000 },
    { upTo: 4_100_000, baseTax: 346_000, rate: 0.3, threshold: 3_200_000 },
    { baseTax: 616_000, rate: 0.35, threshold: 4_100_000 },
  ],
};

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
  const slabs = SALARY_TAX_SLABS[taxYear] ?? SALARY_TAX_SLABS[2026];
  const slab = slabs.find((item) => item.upTo == null || annualSalary <= item.upTo);
  if (!slab) return 0;

  let annualTax = slab.baseTax + Math.max(0, annualSalary - slab.threshold) * slab.rate;
  if (taxYear >= 2026 && annualSalary > 10_000_000) {
    annualTax *= 1.09;
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
