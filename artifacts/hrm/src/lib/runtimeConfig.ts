export type TaxSlab = {
  upTo?: number;
  baseTax: number;
  rate: number;
  threshold: number;
};

export type TaxYearConfig = {
  taxYear: number;
  slabs: TaxSlab[];
  surchargeThreshold?: number;
  surchargeRate?: number;
};

function parseJsonEnv<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn("Invalid frontend runtime config JSON", error);
    return fallback;
  }
}

export function getFrontendTaxYearConfigs(): TaxYearConfig[] {
  return parseJsonEnv<TaxYearConfig[]>(
    import.meta.env.VITE_HRM_TAX_CONFIG_JSON,
    [],
  );
}
