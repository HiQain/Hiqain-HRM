import type { AppSettings } from "@workspace/db";

type EmployeeCompensationLike = {
  basicSalary: string | number;
  allowances: string | number;
};

type IncrementEventLike = {
  amount: string | number;
  date: string;
  type?: string | null;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveSplitPercents(settings?: Pick<AppSettings, "basicSalaryPercent" | "allowancePercent"> | null) {
  const basicPercent = Math.max(0, Number(settings?.basicSalaryPercent ?? 50));
  const allowancePercent = Math.max(0, Number(settings?.allowancePercent ?? 50));
  const total = basicPercent + allowancePercent;

  if (total <= 0) {
    return { basicRatio: 0.5, allowanceRatio: 0.5 };
  }

  return {
    basicRatio: basicPercent / total,
    allowanceRatio: allowancePercent / total,
  };
}

export function splitCompensationBySettings(
  totalSalary: number,
  settings?: Pick<AppSettings, "basicSalaryPercent" | "allowancePercent"> | null,
) {
  const safeTotal = Math.max(0, roundCurrency(totalSalary));
  const { basicRatio } = resolveSplitPercents(settings);
  const basicSalary = roundCurrency(safeTotal * basicRatio);
  const allowances = roundCurrency(safeTotal - basicSalary);
  return { basicSalary, allowances };
}

export function applyPermanentIncrementToCompensation(
  employee: EmployeeCompensationLike,
  incrementAmount: number,
  settings?: Pick<AppSettings, "basicSalaryPercent" | "allowancePercent"> | null,
) {
  const currentTotal = Number(employee.basicSalary) + Number(employee.allowances);
  return splitCompensationBySettings(currentTotal + incrementAmount, settings);
}

export function resolveCompensationForDate(
  employee: EmployeeCompensationLike,
  incrementEvents: IncrementEventLike[],
  effectiveDate: string,
  settings?: Pick<AppSettings, "basicSalaryPercent" | "allowancePercent"> | null,
) {
  const currentTotal = Number(employee.basicSalary) + Number(employee.allowances);
  const futureIncrements = incrementEvents
    .filter((event) => (event.type ?? "increment") === "increment" && event.date > effectiveDate)
    .reduce((sum, event) => sum + Number(event.amount), 0);
  return splitCompensationBySettings(currentTotal - futureIncrements, settings);
}

export function inferPercentageBaseAmount(
  resolvedAmount: number,
  percentValue: number | null | undefined,
) {
  if (!percentValue || percentValue <= 0) return resolvedAmount;
  return roundCurrency((resolvedAmount * 100) / percentValue);
}
