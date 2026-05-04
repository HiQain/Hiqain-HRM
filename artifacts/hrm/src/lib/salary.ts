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
  value: number;
  isDeduction?: boolean;
};

const SALARY_TAX_SLABS: Record<number, TaxSlab[]> = {
  2025: [
    { upTo: 600000, baseTax: 0, rate: 0, threshold: 0 },
    { upTo: 1200000, baseTax: 0, rate: 0.05, threshold: 600000 },
    { upTo: 2200000, baseTax: 30000, rate: 0.15, threshold: 1200000 },
    { upTo: 3200000, baseTax: 180000, rate: 0.25, threshold: 2200000 },
    { upTo: 4100000, baseTax: 430000, rate: 0.3, threshold: 3200000 },
    { baseTax: 700000, rate: 0.35, threshold: 4100000 },
  ],
  2026: [
    { upTo: 600000, baseTax: 0, rate: 0, threshold: 0 },
    { upTo: 1200000, baseTax: 0, rate: 0.01, threshold: 600000 },
    { upTo: 2200000, baseTax: 6000, rate: 0.11, threshold: 1200000 },
    { upTo: 3200000, baseTax: 116000, rate: 0.23, threshold: 2200000 },
    { upTo: 4100000, baseTax: 346000, rate: 0.3, threshold: 3200000 },
    { baseTax: 616000, rate: 0.35, threshold: 4100000 },
  ],
} as const;

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
  const slabs =
    SALARY_TAX_SLABS[taxYear as keyof typeof SALARY_TAX_SLABS] ??
    SALARY_TAX_SLABS[2026];
  const slab = slabs.find((item) => item.upTo == null || annualSalary <= item.upTo);
  if (!slab) return 0;

  let annualTax = slab.baseTax + Math.max(0, annualSalary - slab.threshold) * slab.rate;
  if (taxYear >= 2026 && annualSalary > 10000000) {
    annualTax *= 1.09;
  }
  return Math.round((annualTax / 12) * 100) / 100;
}

export function isManualTaxComponent(component: { label: string; isDeduction?: boolean }) {
  return Boolean(component.isDeduction) && /\btax\b/i.test(component.label);
}

function componentValue(component: SalaryComponentLike, basicSalary: number): number {
  if (component.valueType === "percentage") {
    return (component.value / 100) * basicSalary;
  }
  return component.value;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
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
    },
    {
      id: -2,
      label: "Utility Bills",
      kind: "allowance",
      valueType: "fixed",
      value: utilityBills,
      isDeduction: false,
    },
  ].filter((item) => item.value > 0);
}

export function computeSalaryStructurePreview({
  basicSalary,
  defaultAllowances,
  components,
  providentFundPercent,
  month,
  year,
}: {
  basicSalary: number;
  defaultAllowances: number;
  components: SalaryComponentLike[];
  providentFundPercent: number | null | undefined;
  month: number;
  year: number;
}) {
  const designationFixed = components
    .filter(
      (component) =>
        component.kind === "designation" &&
        !component.isDeduction &&
        component.valueType === "fixed",
    )
    .reduce((sum, component) => sum + component.value, 0);

  const resolvedBasicSalary = designationFixed > 0 ? designationFixed : basicSalary;
  let componentAllowances = 0;
  let commission = 0;
  let componentDeductions = 0;
  let providentFund = 0;

  for (const component of components) {
    const value = componentValue(component, resolvedBasicSalary);
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
      commission += value;
      continue;
    }
    componentAllowances += value;
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
    totalAllowances:
      roundCurrency(defaultAllowances + componentAllowances),
    commission: roundCurrency(commission),
    providentFund: roundCurrency(providentFund),
    componentDeductions: roundCurrency(componentDeductions),
    tax,
  };
}
