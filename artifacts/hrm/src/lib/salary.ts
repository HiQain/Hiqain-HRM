type TaxSlab = {
  upTo?: number;
  baseTax: number;
  rate: number;
  threshold: number;
};

type SalaryComponentLike = {
  id: number;
  label: string;
  kind: string;
  valueType: string;
  percentageBase?: string;
  value: number;
  isDeduction?: boolean;
  isTaxable?: boolean;
};
import {
  getFrontendTaxYearConfigs,
  type TaxYearConfig,
} from "@/lib/runtimeConfig";

const TAX_YEAR_CONFIGS = getFrontendTaxYearConfigs();

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

export function getPakistanMonthlySalaryTax(
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

export function isManualTaxComponent(component: { label: string; isDeduction?: boolean }) {
  return Boolean(component.isDeduction) && /\btax\b/i.test(component.label);
}

function componentValue(
  component: SalaryComponentLike,
  basicSalary: number,
  grossSalaryBase: number,
): number {
  if (component.valueType === "percentage") {
    return (
      (component.value / 100) *
      (component.percentageBase === "gross_salary"
        ? grossSalaryBase
        : basicSalary)
    );
  }
  return component.value;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function splitCompensationByPercentages(
  totalSalary: number,
  basicSalaryPercent = 50,
  allowancePercent = 50,
) {
  const total = Math.max(0, totalSalary);
  const ratioSum = Math.max(1, basicSalaryPercent + allowancePercent);
  const basicSalary = roundCurrency(total * (basicSalaryPercent / ratioSum));
  const defaultAllowances = roundCurrency(total - basicSalary);
  return { basicSalary, defaultAllowances };
}

export function resolveHistoricalCompensation({
  currentBasicSalary,
  currentAllowances,
  incrementEvents,
  month,
  year,
  basicSalaryPercent = 50,
  allowancePercent = 50,
}: {
  currentBasicSalary: number;
  currentAllowances: number;
  incrementEvents: Array<{ amount: number; date: string; type?: string }>;
  month: number;
  year: number;
  basicSalaryPercent?: number;
  allowancePercent?: number;
}) {
  const currentTotal = currentBasicSalary + currentAllowances;
  const effectiveDate = `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(year, month, 0).getDate(),
  ).padStart(2, "0")}`;
  const futureIncrementTotal = incrementEvents
    .filter((event) => (event.type ?? "increment") === "increment" && event.date > effectiveDate)
    .reduce((sum, event) => sum + Number(event.amount), 0);
  return splitCompensationByPercentages(
    currentTotal - futureIncrementTotal,
    basicSalaryPercent,
    allowancePercent,
  );
}

export function inferPercentageBaseAmount(
  resolvedAmount: number,
  percentValue?: number | null,
) {
  if (!percentValue || percentValue <= 0) return resolvedAmount;
  return roundCurrency((resolvedAmount * 100) / percentValue);
}

export function getDefaultAllowanceBreakdown(defaultAllowances: number) {
  const total = Math.max(0, defaultAllowances);
  const homeRent = roundCurrency(total / 2);
  const utilityBills = roundCurrency(total - homeRent);

  return [
    {
      id: -1,
      label: "Home Rent",
      kind: "allowance",
      valueType: "fixed",
      value: homeRent,
      isDeduction: false,
      isTaxable: true,
    },
    {
      id: -2,
      label: "Utility Bills",
      kind: "allowance",
      valueType: "fixed",
      value: utilityBills,
      isDeduction: false,
      isTaxable: true,
    },
  ].filter((item) => item.value > 0);
}

export function isProvidentFundApplicableForPeriod(
  probationEndDate: string | Date | null | undefined,
  month: number,
  year: number,
) {
  if (!probationEndDate) return true;

  const periodEnd = new Date(Date.UTC(year, month, 0));
  const probationEnd =
    probationEndDate instanceof Date
      ? probationEndDate
      : new Date(`${probationEndDate}T00:00:00Z`);

  return periodEnd.getTime() > probationEnd.getTime();
}

export function computeSalaryStructurePreview({
  basicSalary,
  defaultAllowances,
  components,
  providentFundPercent,
  month,
  year,
  useDesignationFixedOverride = true,
}: {
  basicSalary: number;
  defaultAllowances: number;
  components: SalaryComponentLike[];
  providentFundPercent: number | null | undefined;
  month: number;
  year: number;
  useDesignationFixedOverride?: boolean;
}) {
  const designationFixed = components
    .filter(
      (component) =>
        component.kind === "designation" &&
        !component.isDeduction &&
        component.valueType === "fixed",
    )
    .reduce((sum, component) => sum + component.value, 0);

  const resolvedBasicSalary =
    useDesignationFixedOverride && designationFixed > 0
      ? designationFixed
      : basicSalary;
  const grossSalaryBase = resolvedBasicSalary + defaultAllowances;
  let componentAllowances = 0;
  let nonTaxableAllowances = 0;
  let commission = 0;
  let nonTaxableCommission = 0;
  let componentDeductions = 0;
  let providentFund = 0;

  for (const component of components) {
    const value = componentValue(
      component,
      resolvedBasicSalary,
      grossSalaryBase,
    );
    if (isManualTaxComponent(component)) continue;
    if (component.isDeduction && component.kind === "provident_fund") {
      providentFund += value;
      continue;
    }
    if (component.isDeduction) {
      componentDeductions += value;
      continue;
    }
    if (component.kind === "designation") continue;
    if (component.kind === "commission") {
      if (component.isTaxable === false) nonTaxableCommission += value;
      else commission += value;
      continue;
    }
    if (component.isTaxable === false) nonTaxableAllowances += value;
    else componentAllowances += value;
  }

  if (providentFund <= 0 && (providentFundPercent ?? 0) > 0) {
    providentFund = ((providentFundPercent ?? 0) / 100) * resolvedBasicSalary;
  }

  const taxableSalary =
    resolvedBasicSalary + defaultAllowances + componentAllowances + commission;
  const tax = getPakistanMonthlySalaryTax(taxableSalary, month, year);

  return {
    basicSalary: resolvedBasicSalary,
    defaultAllowances,
    taxableSalary: roundCurrency(taxableSalary),
    componentAllowances: roundCurrency(componentAllowances),
    nonTaxableAllowances: roundCurrency(nonTaxableAllowances),
    totalAllowances:
      roundCurrency(defaultAllowances + componentAllowances + nonTaxableAllowances),
    commission: roundCurrency(commission),
    nonTaxableCommission: roundCurrency(nonTaxableCommission),
    providentFund: roundCurrency(providentFund),
    componentDeductions: roundCurrency(componentDeductions),
    tax,
  };
}
