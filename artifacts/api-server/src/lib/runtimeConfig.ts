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

export type SampleEmployeeConfig = {
  email: string;
  password: string;
  name: string;
  phone?: string;
  position?: string;
  department?: string;
  positionType: "onsite" | "remote";
  joiningDate: string;
  probationMonths: number;
  officeStartTime: string;
  officeEndTime: string;
  gracePeriodMinutes: number;
  basicSalary: number;
  allowances: number;
  casualLeaveQuota: number;
  sickLeaveQuota: number;
  annualLeaveQuota: number;
  dateOfBirth?: string;
  education?: string;
  address?: string;
};

function parseJsonEnv<T>(name: string, fallback: T): T {
  const raw = process.env[name];
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Invalid JSON in ${name}`, error);
    return fallback;
  }
}

export function getBootstrapAdminConfig() {
  const email = process.env.HRM_BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = process.env.HRM_BOOTSTRAP_ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

export function shouldSeedSampleData(): boolean {
  return process.env.HRM_SEED_SAMPLE_DATA === "true";
}

export function getSampleEmployees(): SampleEmployeeConfig[] {
  return parseJsonEnv<SampleEmployeeConfig[]>("HRM_SAMPLE_EMPLOYEES_JSON", []);
}

export function getTaxYearConfigs(): TaxYearConfig[] {
  return parseJsonEnv<TaxYearConfig[]>("HRM_TAX_CONFIG_JSON", []);
}
